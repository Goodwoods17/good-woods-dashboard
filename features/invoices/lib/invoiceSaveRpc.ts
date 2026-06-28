/**
 * Transactional-save RPC arg builders (issue #171).
 *
 * The review + match saves write a header row AND N line rows. Doing that as
 * separate PostgREST round-trips (one update per line via Promise.all) is NOT
 * atomic: a mid-batch failure leaves the invoice half-saved — the header flipped
 * to `reviewed`, some lines persisted, others stale — with no way to tell which.
 *
 * The fix moves both saves into a single Postgres function (one transaction):
 * `save_reviewed_invoice` / `save_invoice_match`
 * (supabase/migrations/20260712000000_invoice_save_rpcs.sql). A plpgsql function
 * runs in one implicit transaction, so either every row lands or none do.
 *
 * These builders are the seam worth unit-testing: they translate the camelCase
 * UI payload into the snake_case jsonb the RPC consumes. Kept pure (no Supabase)
 * so the mapping is verified in isolation; atomicity is proven by the DB + e2e.
 */
import type { InvoiceLineKind } from "./types";

/** Header fields the review screen edits (camelCase, as the UI holds them). */
export type ReviewedHeaderInput = {
  supplier: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  poRef: string | null;
  preTaxTotal: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
};

/** One editable line from the review screen (camelCase). */
export type ReviewedLineInput = {
  id: string;
  qty: number | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
  taxFlag: boolean | null;
};

/** snake_case header shape the RPC's `p_header` jsonb expects. */
export type ReviewedHeaderArg = {
  supplier: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  po_ref: string | null;
  pre_tax_total: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
};

/** snake_case line shape the RPC's `p_lines` jsonb array expects. */
export type ReviewedLineArg = {
  id: string;
  qty: number | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  tax_flag: boolean | null;
};

export type SaveReviewedArgs = {
  p_invoice_id: string;
  p_header: ReviewedHeaderArg;
  p_lines: ReviewedLineArg[];
};

/** Build the `save_reviewed_invoice` RPC payload from the review-screen state. */
export function buildSaveReviewedArgs(
  invoiceId: string,
  header: ReviewedHeaderInput,
  lines: ReviewedLineInput[]
): SaveReviewedArgs {
  return {
    p_invoice_id: invoiceId,
    p_header: {
      supplier: header.supplier,
      invoice_number: header.invoiceNumber,
      issue_date: header.issueDate,
      due_date: header.dueDate,
      po_ref: header.poRef,
      pre_tax_total: header.preTaxTotal,
      gst: header.gst,
      pst: header.pst,
      total: header.total,
    },
    p_lines: lines.map((l) => ({
      id: l.id,
      qty: l.qty,
      sku: l.sku,
      description: l.description,
      unit: l.unit,
      unit_price: l.unitPrice,
      amount: l.amount,
      tax_flag: l.taxFlag,
    })),
  };
}

/** One line's job + kind assignment from the match screen (camelCase). */
export type MatchLineInput = {
  lineId: string;
  jobId: string | null;
  lineKind?: InvoiceLineKind | null;
};

/** snake_case line shape the `save_invoice_match` RPC expects. */
export type MatchLineArg = {
  id: string;
  job_id: string | null;
  line_kind: InvoiceLineKind | null;
};

export type SaveMatchArgs = {
  p_invoice_id: string;
  p_supplier_id: string | null;
  p_lines: MatchLineArg[];
};

/** Build the `save_invoice_match` RPC payload from the match-screen state. */
export function buildSaveMatchArgs(
  invoiceId: string,
  supplierId: string | null,
  lineAssignments: MatchLineInput[]
): SaveMatchArgs {
  return {
    p_invoice_id: invoiceId,
    p_supplier_id: supplierId,
    p_lines: lineAssignments.map((a) => ({
      id: a.lineId,
      job_id: a.jobId,
      line_kind: a.lineKind ?? null,
    })),
  };
}
