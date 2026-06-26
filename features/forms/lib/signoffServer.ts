/**
 * Server-safe signoff PDF generation (Forms P2 · Slice 4, issue #43).
 *
 * Twin of `signoff.ts` (the browser path) but omits the download step —
 * suitable for Node.js route handlers where `document` and
 * `URL.createObjectURL` are unavailable. Same react-pdf renderer + same
 * FormSignoffDocument component; the diff is:
 *   - No `"use client"` directive
 *   - No `URL.createObjectURL` / `document.createElement` download
 *   - Returns only the Blob + storagePath so the caller can record the
 *     path and (optionally) file it on the job.
 *
 * This module MUST NOT import `signoff.ts` — that file declares
 * `"use client"` which would pull browser-only code into the server
 * bundle. All shared logic lives in `completion.ts` and `storage.ts`.
 */

import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { uploadSignoffPdf } from "./storage";

/**
 * Pre-resolve photo + signature paths to renderable URLs, keyed by field
 * id. Identical to the same helper in `signoff.ts` but duplicated here to
 * avoid importing the `"use client"` file.
 */
async function resolveImages(
  fields: FormInstanceField[],
  resolveUrl: (path: string) => Promise<string>
): Promise<Record<string, string>> {
  const media = fields.filter(
    (f) =>
      (f.type === "photo" || f.type === "signature") && typeof f.photoUrl === "string" && f.photoUrl
  );
  const entries = await Promise.all(
    media.map(async (f) => {
      try {
        const url = await resolveUrl(f.photoUrl as string);
        return [f.id, url] as const;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
}

export type ServerSignoffResult = { blob: Blob; storagePath: string };

/**
 * Build the signoff PDF for a completed instance, upload it to the
 * private bucket, and return the blob + path. No browser download is
 * triggered — this is safe to call from a Next.js Node.js route handler.
 *
 * `signatureAudit` surfaces the client IP + user-agent on the signoff
 * PDF, exactly as in the browser path.
 */
export async function generateSignoffPdfServer(
  instance: FormInstance,
  fields: FormInstanceField[],
  jobContext?: { code: string; name: string } | null,
  signatureAudit?: { ip: string | null; userAgent: string | null } | null
): Promise<ServerSignoffResult> {
  const { pdf } = await import("@react-pdf/renderer");
  const { FormSignoffDocument } = await import("@features/forms/components/FormSignoffDocument");

  // resolveFormPhotoUrl is imported inline to avoid pulling the full
  // storage module's browser-only conditional code into the critical path.
  const { resolveFormPhotoUrl } = await import("./storage");
  const resolvedImages = await resolveImages(fields, resolveFormPhotoUrl);

  const blob = await pdf(
    FormSignoffDocument({ instance, fields, resolvedImages, jobContext, signatureAudit })
  ).toBlob();

  const { storagePath } = await uploadSignoffPdf(instance.id, blob);
  return { blob, storagePath };
}
