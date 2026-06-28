/**
 * QuickBooks Online (QBO) export logic.
 *
 * `buildQboBill` is the single source of truth: a pure transform of a domain
 * Invoice + its lines into the QBO v3 Bill request body (VendorRef, TxnDate,
 * DocNumber, TxnTaxDetail, Line[] with AccountBasedExpenseLineDetail) plus a
 * reconciliation. No QBO API calls — that is the sync layer.
 *
 * Tax codes are resolved per line through {@link lineTaxKey} against the
 * per-company mapping — never a hardcoded "TAX"/"NON". Header GST + PST stay
 * separate (never collapsed — ADR 0019).
 *
 * (The flat slice-8 `buildQboExport` stub was removed in QBO-H11: it hardcoded
 * "TAX"/"NON" and duplicated this builder, drifting from the real Bill. The
 * export route now delegates to `buildQboBill` only.)
 */
import type { Invoice, InvoiceLine } from "./types";
import { resolveVendorRef } from "./quickbooksLinks";
import { resolveActualKind, allocateLinePst, type ActualKind } from "./postInvoice";
import type { MappingLookups } from "./qboAccountMapping";

/** Add two nullable numbers; returns null only when BOTH inputs are null. */
function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

// ===========================================================================
// QBO S6 (#152) — buildQboBill: the REAL QBO v3 Bill request body
// ===========================================================================
//
// buildQboBill emits the ACTUAL QBO v3 Bill payload a sync layer POSTs:
// VendorRef (S3 central link), Line[] of AccountBasedExpenseLineDetail with a
// per-line AccountRef (S4/S5) + a per-line TaxCodeRef resolved from the GST/PST
// mapping (no more hardcoded "TAX"/"NON"), and a TxnTaxDetail whose GST and PST
// stay as TWO SEPARATE TaxLines — never collapsed into one total (ADR 0019).
//
// Spike result — GST + PST representation: a Canadian Bill expressed with
// `GlobalTaxCalculation: "TaxExcluded"` (line Amounts are pre-tax) plus an
// explicit TxnTaxDetail. Rather than lean on QBO's automatic single-rate
// GlobalTaxCalculation (which would collapse the two taxes behind one combined
// rate), we hand QBO the split: one TaxLine per component. This keeps GST and
// PST individually auditable end-to-end, which is the whole point of ADR 0019.
//
// Still no network write — this is the pure core a future sync task calls.

/** A QBO reference object ({ value } + optional display name). */
export type QboRef = { value: string; name?: string };

/**
 * A line's resolved Canadian tax key. "GST_PST" = both taxes; "GST"/"PST" = one;
 * null = non-taxable. Maps to the per-company QBO TaxCodeRef via the S4/S5
 * `taxByLocal` lookup (keys "GST" | "PST" | "GST_PST").
 */
export type LineTaxKey = "GST" | "PST" | "GST_PST" | null;

/**
 * A line's EXPLICIT Canadian tax treatment (issue #186). The extractor only
 * captures a per-line PST boolean (`taxFlag`), which can't tell a genuinely
 * tax-exempt line apart from a GST-only line — both arrive as `false`/`null`.
 * This explicit class lets a caller that DOES know the difference state it, so
 * an exempt line is never silently keyed to GST:
 *
 *  - "gst_pst"  → the line carries both taxes (subject to what the bill charges)
 *  - "gst_only" → GST applies, PST does not (the "(GST only)" line)
 *  - "exempt"   → NEITHER tax applies — always non-taxable, even on a GST bill
 */
export type LineTaxClass = "gst_pst" | "gst_only" | "exempt";

/** One QBO Bill expense line (AccountBasedExpenseLineDetail). */
export type QboBillLine = {
  LineNum: number;
  Description: string | null;
  /** Pre-tax amount (TaxExcluded). */
  Amount: number | null;
  DetailType: "AccountBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail: {
    AccountRef: QboRef | null;
    /** Per-line tax code; null for a non-taxable line. */
    TaxCodeRef: QboRef | null;
    /** Job this expense bills to; null = shop-stock (still on the bill). */
    CustomerRef: QboRef | null;
    BillableStatus: "Billable" | "NotBillable";
  };
  // ── Internal bookkeeping (underscore-prefixed). NOT part of the QBO request
  //    body — the sync layer reads these for provenance then strips them. ──
  /** material | subtrade — the cost bucket this line books to (#151). */
  _kind: ActualKind;
  /** Source job id (null = shop-stock). */
  _jobId: string | null;
  /** This line's share of the header PST, allocated to sum exactly (ADR 0019). */
  _pstShare: number;
  /** The resolved local tax key behind TaxCodeRef. */
  _localTaxKey: LineTaxKey;
};

/** One TxnTaxDetail tax line — GST and PST are NEVER collapsed (ADR 0019). */
export type QboTaxLine = {
  Amount: number;
  DetailType: "TaxLineDetail";
  TaxLineDetail: {
    /** Pre-tax base this component was charged on. */
    NetAmountTaxable: number;
    /**
     * Per-company QBO **TaxRate**.Id (issue #186). A TaxLine's TaxRateRef takes a
     * TaxRate id — NOT a TaxCode id (those are different objects; crossing them
     * is the #1 tax-misbooking risk). Sourced from `maps.taxRateByLocal`; null
     * when no real TaxRate id is mapped, never a TaxCode id or a placeholder.
     */
    TaxRateRef: QboRef | null;
  };
  /** Which Canadian tax this line is — keeps the split auditable. */
  _component: "GST" | "PST";
};

/** The QBO v3 Bill request body. */
export type QboBill = {
  VendorRef: QboRef | null;
  TxnDate: string | null;
  DueDate: string | null;
  DocNumber: string | null;
  PrivateNote: string | null;
  /** Line Amounts are pre-tax; we supply the tax explicitly below. */
  GlobalTaxCalculation: "TaxExcluded";
  Line: QboBillLine[];
  /**
   * The manual tax split (issue #186). Present in `"manual"` tax mode only. In
   * `"automatic"` mode it is OMITTED so an Automatic-Sales-Tax (AST) company lets
   * QBO compute the tax from each line's TaxCodeRef — AST companies routinely
   * reject/ignore a hand-supplied TxnTaxDetail. The GST/PST split stays auditable
   * regardless via `QboBillReconciliation` (gst/pst + gstBase/pstBase).
   */
  TxnTaxDetail?: {
    /** GST + PST. The split lives in TaxLine[] — this is only the sum. */
    TotalTax: number | null;
    TaxLine: QboTaxLine[];
  };
};

/** Audit check: Σ pre-tax lines + GST + PST must equal the stated total. */
export type QboBillReconciliation = {
  lineSubtotal: number;
  gst: number;
  pst: number;
  /** Pre-tax base GST was charged on (sum of GST + GST_PST lines). #186 */
  gstBase: number;
  /** Pre-tax base PST was charged on (sum of PST + GST_PST lines). #186 */
  pstBase: number;
  computedTotal: number;
  statedTotal: number | null;
  /** True when computedTotal is within a cent of the invoice's stated total. */
  balanced: boolean;
};

/**
 * QBO tax representation mode (issue #186):
 *  - "automatic" — AST-safe: omit the manual TxnTaxDetail; QBO computes tax from
 *    each line's TaxCodeRef. The right mode for a Canadian Automatic-Sales-Tax
 *    company (which rejects a hand-supplied TaxLine).
 *  - "manual" — emit an explicit TxnTaxDetail with one TaxLine per component, the
 *    TaxRateRef sourced from a real TaxRate query (`maps.taxRateByLocal`).
 */
export type QboTaxMode = "automatic" | "manual";

/**
 * Resolve the active tax mode from the environment (issue #186). Defaults to
 * `"manual"` (the historical shape) so the choice stays explicit and is flipped
 * to `"automatic"` only once the manual QBO-sandbox issue confirms AST rejects
 * the hand-supplied TaxLine. Set `QBO_TAX_MODE=automatic` to switch.
 */
export function resolveQboTaxMode(
  env: { QBO_TAX_MODE?: string } = process.env as { QBO_TAX_MODE?: string }
): QboTaxMode {
  return env.QBO_TAX_MODE === "automatic" ? "automatic" : "manual";
}

/** What buildQboBill returns: the postable bill + its reconciliation. */
export type QboBillResult = {
  invoiceId: string;
  invoiceStatus: string;
  bill: QboBill;
  reconciliation: QboBillReconciliation;
};

/** Options threading the central VendorRef + the S4/S5 account/tax maps. */
export type BuildQboBillOptions = {
  /**
   * Central `quickbooks_links` VendorRef (ADR 0021) — WINS over the embedded
   * `invoice.qboVendorId`. Omit to fall back to the embedded column.
   */
  centralVendorRef?: string | null;
  /**
   * Persisted local→QBO id lookups (S4/S5). When supplied, each line's
   * AccountRef + TaxCodeRef resolve to real per-company QBO ids. When omitted
   * (pre-mapping), the raw local labels are used as the ref values so the shape
   * is still complete and inspectable.
   */
  maps?: MappingLookups;
  /**
   * Tax representation mode (issue #186). Defaults to `"manual"` (historical
   * shape). Pass `"automatic"` — or set `QBO_TAX_MODE=automatic` and thread
   * {@link resolveQboTaxMode} — to drop the manual TxnTaxDetail for AST files.
   */
  taxMode?: QboTaxMode;
};

/** Cents-accurate rounding (mirrors postInvoice.round2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normalise a legacy per-line PST flag into an explicit {@link LineTaxClass}.
 *
 *  - true  → "gst_pst"  (PST charged ⇒ GST too, subject to the bill)
 *  - false → "gst_only" (no PST ⇒ the documented "(GST only)" line)
 *  - null  → "exempt"   (unknown ⇒ conservatively non-taxable)
 */
function classFromFlag(taxFlag: boolean | null): LineTaxClass {
  if (taxFlag == null) return "exempt";
  return taxFlag === true ? "gst_pst" : "gst_only";
}

/**
 * Classify a line's Canadian tax into the per-company tax key (issue #186).
 *
 * Accepts EITHER the legacy per-line PST flag (`boolean | null`) OR an explicit
 * {@link LineTaxClass}. The header totals gate the result either way — we never
 * invent a GST or PST component the bill didn't actually charge:
 *
 *  - "gst_pst"  + bill has GST + PST → "GST_PST"
 *  - "gst_pst"  + bill has PST only  → "PST"
 *  - "gst_only" + bill has GST       → "GST"   (the "(GST only)" line)
 *  - "exempt"                        → null    (NEVER keyed to a tax — the fix)
 *  - bill charges neither tax        → null
 *
 * The fix vs. the old behaviour: an EXEMPT line is now modelled explicitly and
 * is never silently keyed to GST just because the bill carries GST — which kept
 * a non-taxable line out of the GST `NetAmountTaxable` base.
 */
export function lineTaxKey(
  flagOrClass: boolean | null | LineTaxClass,
  header: { gst: number | null; pst: number | null }
): LineTaxKey {
  const cls: LineTaxClass =
    typeof flagOrClass === "string" ? flagOrClass : classFromFlag(flagOrClass);
  if (cls === "exempt") return null;
  const billHasGst = (header.gst ?? 0) > 0;
  const billHasPst = (header.pst ?? 0) > 0;
  const pst = cls === "gst_pst" && billHasPst;
  // GST applies to a taxable line (gst_pst or gst_only) whenever the bill does.
  const gst = billHasGst;
  if (gst && pst) return "GST_PST";
  if (pst) return "PST";
  if (gst) return "GST";
  return null;
}

/** Resolve a local label through a lookup, falling back to the label itself. */
function resolveRef(
  localKey: string | null,
  lookup: Record<string, string> | undefined
): QboRef | null {
  if (localKey == null) return null;
  const id = lookup?.[localKey];
  return { value: id ?? localKey };
}

/**
 * Resolve a TaxRateRef from the TaxRate lookup (issue #186). UNLIKE
 * {@link resolveRef}, this NEVER falls back to the local label — a TaxRateRef
 * must be a real QBO TaxRate id or absent (null). Returning a label/TaxCode id
 * here is exactly the misbooking the fix removes.
 */
function resolveTaxRateRef(
  localKey: string,
  taxRateByLocal: Record<string, string> | undefined
): QboRef | null {
  const id = taxRateByLocal?.[localKey];
  return id != null ? { value: id } : null;
}

/**
 * Build the QBO v3 Bill payload (+ reconciliation) from a domain Invoice and its
 * lines. Pure and I/O-free — no Supabase, no QBO API call.
 *
 * Every line on the supplier bill is included — INCLUDING no-job (shop-stock)
 * lines, which job ACTUALS skip but the Bill must not (the Bill is the whole
 * invoice). Shop-stock lines are marked NotBillable with a null CustomerRef.
 */
export function buildQboBill(
  invoice: Pick<
    Invoice,
    | "id"
    | "status"
    | "qboVendorId"
    | "supplier"
    | "invoiceNumber"
    | "issueDate"
    | "dueDate"
    | "poRef"
    | "preTaxTotal"
    | "gst"
    | "pst"
    | "total"
  >,
  lines: Pick<
    InvoiceLine,
    "id" | "lineNo" | "description" | "amount" | "taxFlag" | "qboAccount" | "lineKind" | "jobId"
  >[],
  options: BuildQboBillOptions = {}
): QboBillResult {
  const { centralVendorRef, maps, taxMode = "manual" } = options;

  const vendorRefValue = resolveVendorRef(centralVendorRef, invoice.qboVendorId);
  const vendorRef: QboRef | null =
    vendorRefValue != null
      ? { value: vendorRefValue, ...(invoice.supplier ? { name: invoice.supplier } : {}) }
      : null;

  // PST allocated across taxable lines, summing EXACTLY to the header PST.
  const pstByLine = allocateLinePst(
    lines.map((l) => ({ id: l.id, amount: l.amount, taxFlag: l.taxFlag })),
    invoice.pst
  );

  const billLines: QboBillLine[] = lines.map((l) => {
    const taxKey = lineTaxKey(l.taxFlag, { gst: invoice.gst, pst: invoice.pst });
    const accountRef = resolveRef(l.qboAccount, maps?.accountByLocal);
    const taxCodeRef = taxKey != null ? resolveRef(taxKey, maps?.taxByLocal) : null;
    const billable = l.jobId != null;
    return {
      LineNum: l.lineNo,
      Description: l.description,
      Amount: l.amount,
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: {
        AccountRef: accountRef,
        TaxCodeRef: taxCodeRef,
        CustomerRef: billable ? { value: l.jobId as string } : null,
        BillableStatus: billable ? "Billable" : "NotBillable",
      },
      _kind: resolveActualKind(l.lineKind),
      _jobId: l.jobId ?? null,
      _pstShare: pstByLine[l.id] ?? 0,
      _localTaxKey: taxKey,
    };
  });

  // --- TxnTaxDetail: GST and PST as SEPARATE TaxLines (never collapsed) ------
  const gst = invoice.gst;
  const pst = invoice.pst;
  // Net taxable bases per component, derived from the per-line tax keys.
  const gstBase = round2(
    billLines
      .filter((l) => l._localTaxKey === "GST" || l._localTaxKey === "GST_PST")
      .reduce((s, l) => s + (l.Amount ?? 0), 0)
  );
  const pstBase = round2(
    billLines
      .filter((l) => l._localTaxKey === "PST" || l._localTaxKey === "GST_PST")
      .reduce((s, l) => s + (l.Amount ?? 0), 0)
  );

  const taxLine: QboTaxLine[] = [];
  if (gst != null && gst !== 0) {
    taxLine.push({
      Amount: gst,
      DetailType: "TaxLineDetail",
      // TaxRateRef ← a real TaxRate id (NOT a TaxCode id from taxByLocal). #186
      TaxLineDetail: {
        NetAmountTaxable: gstBase,
        TaxRateRef: resolveTaxRateRef("GST", maps?.taxRateByLocal),
      },
      _component: "GST",
    });
  }
  if (pst != null && pst !== 0) {
    taxLine.push({
      Amount: pst,
      DetailType: "TaxLineDetail",
      TaxLineDetail: {
        NetAmountTaxable: pstBase,
        TaxRateRef: resolveTaxRateRef("PST", maps?.taxRateByLocal),
      },
      _component: "PST",
    });
  }

  const bill: QboBill = {
    VendorRef: vendorRef,
    TxnDate: invoice.issueDate,
    DueDate: invoice.dueDate,
    DocNumber: invoice.invoiceNumber,
    PrivateNote: invoice.poRef,
    GlobalTaxCalculation: "TaxExcluded",
    Line: billLines,
    // "automatic" (AST) omits the manual TxnTaxDetail — QBO computes from each
    // line's TaxCodeRef. "manual" hands QBO the explicit GST/PST split. #186
    ...(taxMode === "manual"
      ? { TxnTaxDetail: { TotalTax: addNullable(gst, pst), TaxLine: taxLine } }
      : {}),
  };

  // --- Reconciliation: Σ pre-tax lines + GST + PST === stated total ----------
  const lineSubtotal = round2(billLines.reduce((s, l) => s + (l.Amount ?? 0), 0));
  const gstAmt = gst ?? 0;
  const pstAmt = pst ?? 0;
  const computedTotal = round2(lineSubtotal + gstAmt + pstAmt);
  const statedTotal = invoice.total;
  const reconciliation: QboBillReconciliation = {
    lineSubtotal,
    gst: gstAmt,
    pst: pstAmt,
    // The per-component taxable bases keep the GST/PST split auditable even in
    // "automatic" mode where the bill carries no manual TxnTaxDetail. #186
    gstBase,
    pstBase,
    computedTotal,
    statedTotal,
    // `<=` (not `<`) so a clean one-cent rounding gap reconciles instead of
    // being false-flagged as a mismatch that blocks an otherwise-correct bill.
    // round2 the gap first so binary-float noise (0.01 stored as 0.009999…)
    // can't flip the verdict either way.
    balanced: statedTotal != null && round2(Math.abs(computedTotal - statedTotal)) <= 0.01,
  };

  return {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    bill,
    reconciliation,
  };
}
