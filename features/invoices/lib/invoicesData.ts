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
import { buildActualRows, postBlockedReason } from "./postInvoice";
import { buildSaveReviewedArgs, buildSaveMatchArgs } from "./invoiceSaveRpc";
import type { Invoice, InvoiceLine, InvoiceLineKind } from "./types";

/** Material/subtrade actuals ledger (job-costing). No shared const exists yet. */
const JOB_COST_ACTUALS_TABLE = "job_cost_actuals";

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
 * The header flip + all line cell writes go through a single Postgres function
 * (`save_reviewed_invoice`), so they run in ONE transaction — either every row
 * lands or none do. The previous version fired the header update + N per-line
 * updates as separate round-trips (Promise.all); a mid-batch failure left the
 * invoice half-saved (header flipped, only some lines persisted) with no
 * rollback (issue #171). A failure now throws with nothing committed; the caller
 * surfaces it and the owner can retry cleanly.
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

  const { data: updated, error } = await sb
    .rpc("save_reviewed_invoice", buildSaveReviewedArgs(id, header, lines))
    .single<InvoiceRow>();
  if (error) throw error;

  return rowToInvoice(updated);
}

/**
 * Slice 4: save supplier + line job assignments for a reviewed invoice.
 *
 * Writes `invoices.supplier_id` and each `invoice_lines.job_id` (null = shop
 * stock) + `invoice_lines.line_kind` (material | subtrade — null = material,
 * #151) through a single Postgres function (`save_invoice_match`), so the
 * supplier write + all line assignments commit in ONE transaction (issue #171).
 * Does NOT change the invoice status — the invoice stays `reviewed` until the
 * owner posts it in slice 5. A mid-batch failure now rolls the whole save back
 * rather than leaving some lines assigned and others stale.
 */
export async function saveInvoiceMatch(
  invoiceId: string,
  supplierId: string | null,
  lineAssignments: Array<{
    lineId: string;
    jobId: string | null;
    lineKind?: InvoiceLineKind | null;
  }>
): Promise<Invoice> {
  const sb = getSupabase();

  const { data: updated, error } = await sb
    .rpc("save_invoice_match", buildSaveMatchArgs(invoiceId, supplierId, lineAssignments))
    .single<InvoiceRow>();
  if (error) throw error;

  return rowToInvoice(updated);
}

/**
 * Slice 5: post a reviewed invoice to job cost actuals (with provenance).
 *
 * Writes one `job_cost_actuals` row per job-assigned line — pre-tax `amount` as
 * the headline, `amount_with_tax` alongside (ADR 0019) — each linked back to its
 * source invoice + line for the audit trail. Then flips status → `posted`.
 *
 * Re-post guard (no double-count): the status flip is an atomic compare-and-set
 * (`.eq("status", "reviewed")`) that serializes concurrent posts — only the
 * winner proceeds to insert. If the insert then fails, the status is reverted to
 * `reviewed` so the owner can retry. A belt-and-suspenders check also blocks a
 * post when actuals from this invoice already exist.
 */
export async function postInvoice(invoiceId: string): Promise<Invoice> {
  const sb = getSupabase();

  const loaded = await getInvoiceWithLines(invoiceId);
  if (!loaded) throw new Error("Invoice not found.");
  const { invoice, lines } = loaded;

  const blocked = postBlockedReason(invoice);
  if (blocked) throw new Error(blocked);

  // Belt: never post twice, even if a prior attempt flipped status but the
  // status revert below didn't land.
  const { data: existing, error: existErr } = await sb
    .from(JOB_COST_ACTUALS_TABLE)
    .select("id")
    .eq("source_invoice_id", invoiceId)
    .limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) {
    throw new Error("This invoice has already been posted to actuals.");
  }

  // 1. Claim the invoice: atomic reviewed → posted. Only one caller wins.
  const { data: claimed, error: claimErr } = await sb
    .from(INVOICES_TABLE)
    .update({ status: "posted" })
    .eq("id", invoiceId)
    .eq("status", "reviewed")
    .select("*")
    .maybeSingle<InvoiceRow>();
  if (claimErr) throw claimErr;
  if (!claimed) {
    // Lost the race (or status changed under us) — treat as already posted.
    throw new Error("This invoice has already been posted to actuals.");
  }

  // 2. Write the actuals. On failure, revert the claim so a retry is possible.
  const rows = buildActualRows(invoice, lines);
  if (rows.length > 0) {
    const { error: insertErr } = await sb.from(JOB_COST_ACTUALS_TABLE).insert(
      rows.map((r) => ({
        job_id: r.jobId,
        kind: r.kind,
        amount: r.amount,
        amount_with_tax: r.amountWithTax,
        source_invoice_id: r.sourceInvoiceId,
        source_invoice_line_id: r.sourceInvoiceLineId,
      }))
    );
    if (insertErr) {
      await sb
        .from(INVOICES_TABLE)
        .update({ status: "reviewed" })
        .eq("id", invoiceId)
        .eq("status", "posted");
      throw insertErr;
    }
  }

  return rowToInvoice(claimed);
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
