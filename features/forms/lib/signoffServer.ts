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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import type { CompanyInfo } from "@features/jobs/lib/invoice";
import { FORM_PHOTOS_BUCKET } from "./storage";

/**
 * Static company identity for the server-rendered signoff PDF branding block.
 * The browser path reads live workspace settings via `getCompany()`, but that
 * lives in a `"use client"` module and cannot be called from this Node route
 * (it resolves to an RSC client-reference proxy → "is not a function"). The
 * live override only ever happens client-side, so on the server the default is
 * the correct value anyway. Mirrors `DEFAULT_COMPANY` in invoice.ts.
 */
const SERVER_COMPANY: CompanyInfo = {
  name: "Good Woods",
  tagline: "Custom cabinetry & millwork",
  address: "Victoria, British Columbia",
  email: "andrew@goodwoods.ca",
  gstNumber: "GST 12345 6789 RT0001",
};

/** Signed-URL lifetime for embedded media (1 hour) — long enough to render. */
const SIGNED_URL_TTL = 60 * 60;

/**
 * Resolve a stored media path to a renderable URL using the SERVICE-ROLE
 * client. Inline `data:`/`http` paths (offline fallback) pass through; bucket
 * paths get a fresh signed URL. The server submit path must NOT use the
 * browser Supabase client from `@shared/lib/supabase` (it eagerly spins up a
 * realtime/WebSocket connection that crashes under Node), so URL signing is
 * threaded through the same service-role client used for the upload.
 */
async function resolveImageUrlServer(sb: SupabaseClient, storagePath: string): Promise<string> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) {
    return storagePath;
  }
  const { data, error } = await sb.storage
    .from(FORM_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Pre-resolve photo + signature paths to renderable URLs, keyed by field
 * id. Identical to the same helper in `signoff.ts` but resolves via the
 * service-role client instead of the browser client.
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

export type ServerSignoffResult = { buffer: Buffer; storagePath: string };

/**
 * Build the signoff PDF for a completed instance, upload it to the private
 * bucket with the SERVICE-ROLE client, and return the bytes + path. Safe to
 * call from a Next.js Node.js route handler — there is no browser download and
 * no browser Supabase client involved.
 *
 * Two server-correctness points (the slice-4 auto-file bug):
 *   1. The PDF is rendered with `renderToBuffer`, the server API. The browser
 *      path's `pdf(Doc).toBlob()` relies on Blob/URL plumbing that does not
 *      hold up in the Node route bundle.
 *   2. The upload + signed-URL signing go through the passed service-role `sb`,
 *      never `getSupabase()` (the `@supabase/ssr` browser client). Constructing
 *      that client server-side eagerly initializes realtime/WebSocket, which
 *      throws under Node ("a is not a function" after minification) and was
 *      swallowed by the best-effort catch — so nothing ever got filed.
 *
 * `signatureAudit` surfaces the client IP + user-agent on the signoff PDF,
 * exactly as in the browser path.
 */
export async function generateSignoffPdfServer(
  sb: SupabaseClient,
  instance: FormInstance,
  fields: FormInstanceField[],
  jobContext?: { code: string; name: string } | null,
  signatureAudit?: { ip: string | null; userAgent: string | null } | null
): Promise<ServerSignoffResult> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { FormSignoffDocument } = await import("@features/forms/components/FormSignoffDocument");

  const resolvedImages = await resolveImages(fields, (path) => resolveImageUrlServer(sb, path));

  const buffer = await renderToBuffer(
    FormSignoffDocument({
      instance,
      fields,
      resolvedImages,
      jobContext,
      signatureAudit,
      company: SERVER_COMPANY,
    })
  );

  // Deterministic path (mirrors the browser uploadSignoffPdf): one object per
  // instance, upserted, so a re-submit overwrites rather than piling up.
  const storagePath = `${instance.id}/signoff.pdf`;
  const { error } = await sb.storage.from(FORM_PHOTOS_BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;

  return { buffer, storagePath };
}
