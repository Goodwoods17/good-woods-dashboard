/**
 * Camera capture helpers for Slice 7 — PWA mobile invoice snap.
 *
 * On mobile, `<input type="file" accept="image/*" capture="environment">` opens
 * the rear camera directly. On desktop it falls back to a file picker. This is
 * the standard PWA approach — no getUserMedia API needed, no extra deps.
 *
 * The multi-page flow creates one pending `invoices` row per capture session,
 * uploading each snapped page as `<id>/page_<n>.<ext>`. `storage_path` points
 * to page 1 (the extractor's primary entry point, ADR 0019); the full set of
 * paths is stored in the `pages` column (added in slice-7 migration).
 *
 * This is engine-independent: the capture side just creates the pending row.
 * Multi-page extraction optimisation is future work.
 */

import { getSupabase, INVOICES_TABLE } from "@shared/lib/supabase";
import { invoiceFileExt, INVOICES_BUCKET } from "./storage";
import { rowToInvoice } from "./invoiceRowMaps";
import type { InvoiceRow } from "./invoiceRowMaps";
import type { Invoice } from "./types";

/** Maximum pages the camera capture UI allows per invoice session. */
export const MAX_CAMERA_PAGES = 10;

/**
 * Build the Storage path for one captured page.
 * Pattern: `<invoiceId>/page_<n>.<ext>` (1-based).
 */
export function buildPagePath(invoiceId: string, pageNum: number, ext: string): string {
  return `${invoiceId}/page_${pageNum}.${ext}`;
}

/**
 * Derive all page Storage paths for an ordered array of captured files.
 * Returns `<invoiceId>/page_1.<ext>`, `<invoiceId>/page_2.<ext>`, … (1-based).
 */
export function buildCapturePages(invoiceId: string, files: File[]): string[] {
  return files.map((f, i) => buildPagePath(invoiceId, i + 1, invoiceFileExt(f)));
}

/**
 * Capture multiple camera-snapped pages as a single `pending` invoice.
 *
 * Flow (mirrors `captureInvoice` in invoicesData.ts):
 *   1. Insert a `pending` row (storage_path seeded as placeholder).
 *   2. Upload all pages in parallel under `<id>/page_<n>.<ext>`.
 *   3. Update: storage_path = first page; pages = full paths array.
 *
 * The caller must ensure files.length >= 1 and <= MAX_CAMERA_PAGES.
 */
export async function captureMultiPageInvoice(files: File[]): Promise<Invoice> {
  if (files.length === 0) throw new Error("At least one page is required.");
  if (files.length > MAX_CAMERA_PAGES) {
    throw new Error(`A camera capture can have at most ${MAX_CAMERA_PAGES} pages.`);
  }

  const sb = getSupabase();

  // 1. Insert a pending row to obtain an id for path construction.
  const pageLabel = files.length === 1 ? "1 page" : `${files.length} pages`;
  const { data: created, error: insertErr } = await sb
    .from(INVOICES_TABLE)
    .insert({
      status: "pending",
      storage_path: "pending",
      mime: files[0].type || "image/jpeg",
      original_filename: `camera-capture-${pageLabel}.jpg`,
    })
    .select("*")
    .single<InvoiceRow>();
  if (insertErr) throw insertErr;

  // 2. Upload all pages in parallel — deterministic paths for idempotency.
  const pagePaths = buildCapturePages(created.id, files);
  const uploadResults = await Promise.allSettled(
    files.map((file, i) =>
      sb.storage.from(INVOICES_BUCKET).upload(pagePaths[i], file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      })
    )
  );
  const uploadError = uploadResults.find((r) => r.status === "rejected");
  if (uploadError) throw (uploadError as PromiseRejectedResult).reason;

  // 3. Stamp the real paths: storage_path = page 1 (primary); pages = all.
  const { data: updated, error: updateErr } = await sb
    .from(INVOICES_TABLE)
    .update({
      storage_path: pagePaths[0],
      pages: pagePaths,
    })
    .eq("id", created.id)
    .select("*")
    .single<InvoiceRow>();
  if (updateErr) throw updateErr;

  return rowToInvoice(updated);
}
