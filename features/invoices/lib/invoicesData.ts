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

/**
 * Slice 3: persist a human-corrected invoice and flip its status to `reviewed`.
 *
 * Updates the header row and all line cells in a single-round-trip pair. The
 * lines are updated individually since Supabase PostgREST doesn't support
 * heterogeneous bulk updates (different values per row). Each line update is
 * fired in parallel; a failure will throw and the caller should surface the
 * error without retrying automatically.
 */
export async function saveReviewedInvoice(
  id: string,
  header: {
    supplier: string | null;
    invoiceNumber: string | null;
    issueDate: string | null;
    dueDate: string | null;
    poRef: string | null;
    preTaxTotal: number | null;
    gst: number | null;
    pst: number | null;
    total: number | null;
  },
  lines: Array<{
    id: string;
    qty: number | null;
    sku: string | null;
    description: string | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number | null;
    taxFlag: boolean | null;
  }>
): Promise<Invoice> {
  const sb = getSupabase();

  const { data: updated, error: headerErr } = await sb
    .from(INVOICES_TABLE)
    .update({
      status: "reviewed",
      supplier: header.supplier,
      invoice_number: header.invoiceNumber,
      issue_date: header.issueDate,
      due_date: header.dueDate,
      po_ref: header.poRef,
      pre_tax_total: header.preTaxTotal,
      gst: header.gst,
      pst: header.pst,
      total: header.total,
    })
    .eq("id", id)
    .select("*")
    .single<InvoiceRow>();
  if (headerErr) throw headerErr;

  // Parallel line updates — each line has different values.
  await Promise.all(
    lines.map(async (line) => {
      const { error } = await sb
        .from(INVOICE_LINES_TABLE)
        .update({
          qty: line.qty,
          sku: line.sku,
          description: line.description,
          unit: line.unit,
          unit_price: line.unitPrice,
          amount: line.amount,
          tax_flag: line.taxFlag,
        })
        .eq("id", line.id);
      if (error) throw error;
    })
  );

  return rowToInvoice(updated);
}

/**
 * Slice 3: duplicate-invoice guard.
 *
 * Returns a matching invoice if another row already exists with the same
 * supplier name + invoice number (excluding the current invoice). Both
 * values are compared case-insensitively at the DB level via `ilike`.
 * Returns null when no duplicate is found.
 */
export async function checkDuplicateInvoice(
  supplier: string,
  invoiceNumber: string,
  excludeId: string
): Promise<Invoice | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(INVOICES_TABLE)
    .select("*")
    .ilike("supplier", supplier)
    .ilike("invoice_number", invoiceNumber)
    .neq("id", excludeId)
    // A duplicate guard must not break when more than one duplicate exists —
    // that's precisely when it matters most. Flag the first match.
    .limit(1)
    .maybeSingle<InvoiceRow>();
  if (error) throw error;
  if (!data) return null;
  return rowToInvoice(data);
}
