"use client";

import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { resolveFormPhotoUrl, uploadSignoffPdf } from "./storage";
import { signoffFileName } from "./completion";
import { preResolveImages } from "./signoffImages";

/**
 * Signoff PDF generation for a completed form instance (issue #35).
 *
 * Modelled on the invoice PDF pattern (`@features/jobs/lib/invoice.ts`):
 * dynamic-import `@react-pdf/renderer` + the document component so the renderer
 * chunk stays out of the main bundle, then `pdf(Doc).toBlob()`.
 *
 * react-pdf needs image `src` URLs synchronously at render time, so every
 * photo/signature field's stored path is pre-resolved to a renderable URL
 * (signed URL or inline data: URL) BEFORE the document is constructed
 * (`preResolveImages` in `signoffImages.ts`, shared with the server path).
 */

export type SignoffResult = { blob: Blob; storagePath: string };

/**
 * Build the signoff PDF for a completed instance, trigger a browser download,
 * upload it to the private bucket, and return the blob + storage path so the
 * caller can record it as the instance's `signoff_path`.
 */
export async function generateSignoffPdf(
  instance: FormInstance,
  fields: FormInstanceField[],
  jobContext?: { code: string; name: string } | null,
  signatureAudit?: { ip: string | null; userAgent: string | null } | null
): Promise<SignoffResult> {
  const { pdf } = await import("@react-pdf/renderer");
  const { FormSignoffDocument } = await import("@features/forms/components/FormSignoffDocument");

  const resolvedImages = await preResolveImages(fields, (path) => resolveFormPhotoUrl(path));

  const blob = await pdf(
    FormSignoffDocument({ instance, fields, resolvedImages, jobContext, signatureAudit })
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
