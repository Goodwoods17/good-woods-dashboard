/**
 * Capture-file helpers for the private `invoices` Storage bucket (stood up in
 * the slice-1 migration). Mirrors the reface/forms photo-helper pattern: a
 * private bucket, RLS-authenticated, with signed URLs for read-back.
 *
 * The capture path is engine-independent and cloud-side (ADR 0019): a file goes
 * to Storage and an `invoice` row lands at `pending` — no home machine needed.
 */
import { getSupabase } from "@shared/lib/supabase";

export const INVOICES_BUCKET = "invoices";

/** Signed-URL lifetime (1 hour) — long enough for a review session. */
const SIGNED_URL_TTL = 60 * 60;

/** Normalize a file extension from a name or mime subtype (pure, testable). */
export function invoiceFileExt(file: { name: string; type: string }): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const ext = (fromName || file.type.split("/")[1] || "pdf").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "pdf";
}

/** Deterministic object path: `<invoiceId>/source.<ext>` (one file per invoice). */
export function invoiceObjectPath(invoiceId: string, file: { name: string; type: string }): string {
  return `${invoiceId}/source.${invoiceFileExt(file)}`;
}

/**
 * Upload a captured invoice file under `<invoiceId>/source.<ext>` and return
 * that storage path. Browser-side; requires Supabase configured (the capture UI
 * is gated behind that check upstream).
 */
export async function uploadInvoiceFile(
  invoiceId: string,
  file: File
): Promise<{ storagePath: string }> {
  const sb = getSupabase();
  const path = invoiceObjectPath(invoiceId, file);
  const { error } = await sb.storage.from(INVOICES_BUCKET).upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path };
}

/** Resolve a storage path to a fresh signed URL for in-app display. */
export async function resolveInvoiceFileUrl(storagePath: string): Promise<string> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) {
    return storagePath;
  }
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}
