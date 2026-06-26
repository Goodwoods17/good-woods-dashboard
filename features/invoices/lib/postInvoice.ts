/**
 * Pure posting logic for Slice 5 (issue #50) — commit a reviewed invoice to
 * job cost actuals with provenance. No Supabase, no React — fully testable.
 *
 * Tax basis (ADR 0019): the pre-tax line `amount` is the HEADLINE actual booked
 * to estimated-vs-actual. The "with PST" figure shown alongside adds each line's
 * share of the invoice's header PST, allocated proportionally and rounded so the
 * parts sum EXACTLY to the header PST (money is never lost or created).
 *
 * Re-post guard: only a `reviewed` invoice can be posted; once posted it flips to
 * `posted` and `canPostInvoice` returns false, so the same bill can't double-count.
 */
import type { Invoice, InvoiceLine } from "./types";

export type ActualKind = "material" | "subtrade";

/** One job_cost_actuals row a post will write. */
export type PostableActual = {
  jobId: string;
  kind: ActualKind;
  amount: number; // pre-tax headline actual
  amountWithTax: number; // headline + allocated PST share
  sourceInvoiceId: string;
  sourceInvoiceLineId: string;
};

/** Cents-accurate rounding (avoids 0.1 + 0.2 drift). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Allocate the invoice header PST across its taxable lines, proportional to each
 * line's pre-tax amount. Each share is rounded to the cent; the last taxable
 * line absorbs any rounding residual so the shares sum EXACTLY to the header PST.
 * Returns a map keyed by line id (non-taxable / zero-amount lines are absent).
 */
export function allocateLinePst(
  lines: Pick<InvoiceLine, "id" | "amount" | "taxFlag">[],
  headerPst: number | null
): Record<string, number> {
  const out: Record<string, number> = {};
  const pst = headerPst ?? 0;
  if (pst === 0) return out;

  const taxable = lines.filter((l) => l.taxFlag === true && (l.amount ?? 0) > 0);
  const totalTaxable = taxable.reduce((s, l) => s + (l.amount ?? 0), 0);
  if (totalTaxable <= 0) return out;

  let allocated = 0;
  taxable.forEach((l, i) => {
    const isLast = i === taxable.length - 1;
    const share = isLast ? round2(pst - allocated) : round2((pst * (l.amount ?? 0)) / totalTaxable);
    out[l.id] = share;
    allocated = round2(allocated + share);
  });
  return out;
}

/**
 * Build the job_cost_actuals rows a reviewed invoice posts: one per line that is
 * assigned to a job and carries an amount. Shop-stock lines (null job) and lines
 * with no amount are skipped — they never reach a job's actuals.
 *
 * `kind` defaults to "material" (supplier-bill purchases). Branching to
 * "subtrade" is a later concern; the field exists so callers can extend.
 */
export function buildActualRows(
  invoice: Pick<Invoice, "id" | "pst">,
  lines: Pick<InvoiceLine, "id" | "amount" | "taxFlag" | "jobId">[]
): PostableActual[] {
  const pstByLine = allocateLinePst(lines, invoice.pst);
  const rows: PostableActual[] = [];
  for (const line of lines) {
    if (line.jobId == null) continue;
    if (line.amount == null) continue;
    const amount = round2(line.amount);
    const pstShare = pstByLine[line.id] ?? 0;
    rows.push({
      jobId: line.jobId,
      kind: "material",
      amount,
      amountWithTax: round2(amount + pstShare),
      sourceInvoiceId: invoice.id,
      sourceInvoiceLineId: line.id,
    });
  }
  return rows;
}

/** Re-post guard: only a reviewed invoice can be posted. */
export function canPostInvoice(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "reviewed";
}

/** Plain-English reason a non-reviewed invoice can't be posted (null if it can). */
export function postBlockedReason(invoice: Pick<Invoice, "status">): string | null {
  switch (invoice.status) {
    case "reviewed":
      return null;
    case "posted":
      return "This invoice has already been posted to actuals.";
    case "pending":
    case "needs_review":
      return "Review this invoice before posting it to actuals.";
    case "error":
      return "This invoice has an extraction error and can't be posted.";
  }
}
