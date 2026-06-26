/**
 * Client-side data access for invoice capture + read-back (slice 1 tracer).
 * Capture is cloud-side and engine-independent (ADR 0019): insert a `pending`
 * row, upload the file under `<id>/source.<ext>`, then stamp the storage path.
 *
 * Kept as plain async functions (not a context store) — the tracer's surfaces
 * are a simple list + raw-JSON detail, so a heavyweight provider would be
 * over-engineering for this slice.
 */
import { getSupabase, INVOICES_TABLE, INVOICE_LINES_TABLE } from "@shared/lib/supabase";
import { uploadInvoiceFile } from "./storage";
import {
  rowToInvoice,
  rowToInvoiceLine,
  type InvoiceRow,
  type InvoiceLineRow,
} from "./invoiceRowMaps";
import type { Invoice, InvoiceLine } from "./types";

/** MIME → accepted? Drives both the <input accept> and a defensive guard. */
export const ACCEPTED_INVOICE_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
] as const;

export function isAcceptedInvoiceFile(file: { type: string; name: string }): boolean {
  if ((ACCEPTED_INVOICE_MIME as readonly string[]).includes(file.type)) return true;
  // HEIC often arrives with an empty/odd mime — fall back to the extension.
  return /\.(pdf|jpe?g|png|heic)$/i.test(file.name);
}

/**
 * Capture a file: create a `pending` invoice, upload the source to Storage, and
 * record its path. Returns the captured invoice (status `pending`).
 */
export async function captureInvoice(file: File): Promise<Invoice> {
  const sb = getSupabase();

  // 1. Insert a pending row first so we have its id for the storage path.
  //    storage_path is NOT NULL, so seed it with the deterministic target path.
  const { data: created, error: insertErr } = await sb
    .from(INVOICES_TABLE)
    .insert({
      status: "pending",
      storage_path: "pending",
      mime: file.type || null,
      original_filename: file.name || null,
    })
    .select("*")
    .single<InvoiceRow>();
  if (insertErr) throw insertErr;

  // 2. Upload the source file under <id>/source.<ext>.
  const { storagePath } = await uploadInvoiceFile(created.id, file);

  // 3. Stamp the real storage path.
  const { data: updated, error: updateErr } = await sb
    .from(INVOICES_TABLE)
    .update({ storage_path: storagePath })
    .eq("id", created.id)
    .select("*")
    .single<InvoiceRow>();
  if (updateErr) throw updateErr;

  return rowToInvoice(updated);
}

/** List all captured invoices, newest first. */
export async function listInvoices(): Promise<Invoice[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(INVOICES_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as InvoiceRow[]).map(rowToInvoice);
}

/** Fetch one invoice + its lines (lines ordered by line_no). */
export async function getInvoiceWithLines(
  id: string
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const sb = getSupabase();
  const { data: invRow, error: invErr } = await sb
    .from(INVOICES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (invErr) throw invErr;
  if (!invRow) return null;

  const { data: lineRows, error: lineErr } = await sb
    .from(INVOICE_LINES_TABLE)
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) throw lineErr;

  return {
    invoice: rowToInvoice(invRow),
    lines: (lineRows as InvoiceLineRow[]).map(rowToInvoiceLine),
  };
}
