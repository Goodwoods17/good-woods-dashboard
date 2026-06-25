"use client";

import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { resolveFormPhotoUrl, uploadSignoffPdf } from "./storage";
import { signoffFileName } from "./completion";

/**
 * Signoff PDF generation for a completed form instance (issue #35).
 *
 * Modelled on the invoice PDF pattern (`@features/jobs/lib/invoice.ts`):
 * dynamic-import `@react-pdf/renderer` + the document component so the renderer
 * chunk stays out of the main bundle, then `pdf(Doc).toBlob()`.
 *
 * react-pdf needs image `src` URLs synchronously at render time, so every
 * photo/signature field's stored path is pre-resolved to a renderable URL
 * (signed URL or inline data: URL) BEFORE the document is constructed.
 */

/** Pre-resolve photo + signature paths to renderable URLs, keyed by field id. */
async function resolveImages(fields: FormInstanceField[]): Promise<Record<string, string>> {
  const media = fields.filter(
    (f) =>
      (f.type === "photo" || f.type === "signature") && typeof f.photoUrl === "string" && f.photoUrl
  );
  const entries = await Promise.all(
    media.map(async (f) => {
      try {
        const url = await resolveFormPhotoUrl(f.photoUrl as string);
        return [f.id, url] as const;
      } catch {
        // A missing/expired image must not abort the whole signoff — skip it.
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
}

export type SignoffResult = { blob: Blob; storagePath: string };

/**
 * Build the signoff PDF for a completed instance, trigger a browser download,
 * upload it to the private bucket, and return the blob + storage path so the
 * caller can record it as the instance's `signoff_path`.
 */
export async function generateSignoffPdf(
  instance: FormInstance,
  fields: FormInstanceField[],
  jobContext?: { code: string; name: string } | null
): Promise<SignoffResult> {
  const { pdf } = await import("@react-pdf/renderer");
  const { FormSignoffDocument } = await import("@features/forms/components/FormSignoffDocument");

  const resolvedImages = await resolveImages(fields);

  const blob = await pdf(
    FormSignoffDocument({ instance, fields, resolvedImages, jobContext })
  ).toBlob();

  // Trigger the download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = signoffFileName(instance.title, instance.completedAt ?? new Date().toISOString());
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  // Store it against the instance (caller records the returned path).
  const { storagePath } = await uploadSignoffPdf(instance.id, blob);
  return { blob, storagePath };
}
