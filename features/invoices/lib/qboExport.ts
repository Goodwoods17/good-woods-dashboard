/**
 * QuickBooks Online (QBO) export logic for Slice 8 (issue #53).
 *
 * Pure transform: Invoice + InvoiceLine[] → QboBillExport (QBO Bill shape).
 * No QBO API calls — that is Phase 2. The shape follows the QBO v3 Bill
 * resource: VendorRef, TxnDate, DocNumber, TxnTaxDetail, Line[] with
 * AccountBasedExpenseLineDetail per the QBO API spec.
 *
 * Tax mapping: taxFlag=true → "TAX" (line carries Canadian GST/PST);
 * taxFlag=false/null → "NON". Header GST + PST are stored separately
 * (never collapsed — ADR 0019) and map to TxnTaxDetail.totalTax.
 */
import type { Invoice, InvoiceLine } from "./types";
import { resolveVendorRef } from "./quickbooksLinks";
import { resolveActualKind, allocateLinePst, type ActualKind } from "./postInvoice";
import type { MappingLookups } from "./qboAccountMapping";

/** One QBO Bill line (AccountBasedExpenseLineDetail shape). */
export type QboLineDetail = {
  lineNum: number;
  description: string | null;
  amount: number | null;
  /** Maps to invoice_lines.qbo_account → QBO AccountRef.value. */
  accountRef: string | null;
  /** "TAX" when the line carries GST/PST; "NON" when exempt. */
  taxCodeRef: "TAX" | "NON";
  /** Kept for reference (supplier SKU); not a native QBO field. */
  sku: string | null;
  /**
   * Cost kind this line books as: "material" | "subtrade" (#151). The sync
   * layer picks the subtrade expense account/bucket for subtrade lines so a
   * sub bill doesn't mis-book as material. Resolved from the line's `lineKind`
   * tag — an untagged line defaults to material (unchanged behaviour).
   */
  kind: ActualKind;
};

/**
 * QBO Bill export shape.
 *
 * Property names mirror QBO v3 camelCase conventions so a future sync layer
 * can map them straight to the API request body with minimal translation.
 */
export type QboBillExport = {
  // Internal references (not sent to QBO; needed for sync bookkeeping).
  invoiceId: string;
  invoiceStatus: string;
  // QBO Bill VendorRef.
  vendorRef: string | null; // invoice.qboVendorId → VendorRef.value
  vendorName: string | null; // invoice.supplier    → VendorRef.name (display)
  // QBO Bill header fields.
  docNumber: string | null; // invoice.invoiceNumber
  txnDate: string | null; // invoice.issueDate
  dueDate: string | null;
  privateNote: string | null; // invoice.poRef
  // Amounts (CAD). Taxes are NEVER collapsed (ADR 0019).
  preTaxTotal: number | null;
  gst: number | null;
  pst: number | null;
  totalAmt: number | null;
  /** TxnTaxDetail.TotalTax = gst + pst. Null when both are null. */
  totalTax: number | null;
  // Line items (AccountBasedExpenseLineDetail).
  lines: QboLineDetail[];
};

/** Add two nullable numbers; returns null only when BOTH inputs are null. */
function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Build a QBO Bill export from a domain Invoice + its lines.
 *
 * This is the pure, testable core that a future QBO sync task will call.
 * No I/O — callers supply the already-loaded invoice + lines.
 *
 * VendorRef source of truth (ADR 0021): when a central `quickbooks_links`
 * mapping exists for this invoice's supplier, pass its qbo_id as
 * `centralVendorRef` — it WINS over the legacy embedded `invoice.qboVendorId`
 * (slice 8). Omit it and the export falls back to the embedded column, so every
 * existing caller keeps working unchanged.
 */
export function buildQboExport(
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
    "lineNo" | "description" | "amount" | "sku" | "taxFlag" | "qboAccount" | "lineKind"
  >[],
  centralVendorRef?: string | null
): QboBillExport {
  return {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    vendorRef: resolveVendorRef(centralVendorRef, invoice.qboVendorId),
    vendorName: invoice.supplier,
    docNumber: invoice.invoiceNumber,
    txnDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    privateNote: invoice.poRef,
    preTaxTotal: invoice.preTaxTotal,
    gst: invoice.gst,
    pst: invoice.pst,
    totalAmt: invoice.total,
    totalTax: addNullable(invoice.gst, invoice.pst),
    lines: lines.map((l) => ({
      lineNum: l.lineNo,
      description: l.description,
      amount: l.amount,
      accountRef: l.qboAccount,
      taxCodeRef: l.taxFlag === true ? "TAX" : "NON",
      sku: l.sku,
      kind: resolveActualKind(l.lineKind),
    })),
  };
}

// ===========================================================================
// QBO S6 (#152) — buildQboBill: the REAL QBO v3 Bill request body
// ===========================================================================
//
// buildQboExport (above) is a flat, mappable shape kept for the slice-8 export
// stub. buildQboBill emits the ACTUAL QBO v3 Bill payload a sync layer POSTs:
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
 * A line's EXPLICIT Canadian tax treatment (QBO-H3, #186). Unlike the captured
 * per-line PST `taxFlag` (a boolean that conflates "GST-only" with "exempt"),
 * this enum models the four outcomes a Bill line can actually have so the per-
 * line tax code — and therefore each TaxLine's `NetAmountTaxable` — is correct:
 *
 *  - "gst_pst"  — taxable for both GST and PST (the common materials line).
 *  - "gst_only" — GST applies, PST-exempt (the "(GST only)" supplies line).
 *  - "pst_only" — PST applies but no GST (rare; e.g. a PST-only adjustment).
 *  - "exempt"   — fully non-taxable; carries NEITHER tax even on a taxed bill.
 *
 * The header still gates the result (we never invent a component the BILL didn't
 * charge), but "exempt" is honoured unconditionally — that is the bug fix:
 * before, a `taxFlag === false` line was always keyed GST on a GST bill, so a
 * genuinely exempt line wrongly inflated the GST `NetAmountTaxable`.
 */
export type LineTaxTreatment = "gst_pst" | "gst_only" | "pst_only" | "exempt";

/**
 * How buildQboBill represents the bill's tax (QBO-H3, #186).
 *
 *  - "line-codes" (DEFAULT, AST-safe): rely on each line's `TaxCodeRef` and let
 *    QBO's Automatic Sales Tax compute GST + PST. NO manual `TxnTaxDetail` is
 *    emitted — Canadian AST companies reject/ignore a manual TaxLine, which is
 *    the #1 misbooking risk this issue closes.
 *  - "manual-detail": emit an explicit `TxnTaxDetail` with one TaxLine per
 *    component. Only valid for a NON-AST (manual sales-tax) company, where each
 *    TaxLine's `TaxRateRef` is a real **TaxRate** id resolved from
 *    `maps.taxRateByLocal` (never a TaxCode id). Use only after the live-sandbox
 *    gate (#195) confirms the company is non-AST.
 */
export type QboTaxMode = "line-codes" | "manual-detail";

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
    /** Per-company QBO tax-rate ref, when the mapping resolves one. */
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
   * Present ONLY in the "manual-detail" tax mode. In the default AST-safe
   * "line-codes" mode this is omitted entirely so QBO computes the tax from each
   * line's `TaxCodeRef` (QBO-H3, #186) — sending a manual TaxLine to an AST
   * company is the misbooking risk this issue removes.
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
  computedTotal: number;
  statedTotal: number | null;
  /** True when computedTotal is within a cent of the invoice's stated total. */
  balanced: boolean;
};

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
   * How to represent the bill's tax (QBO-H3, #186). Defaults to the AST-safe
   * "line-codes" mode (no manual TxnTaxDetail; QBO computes from each line's
   * TaxCodeRef). Switch to "manual-detail" only for a confirmed non-AST company.
   */
  taxMode?: QboTaxMode;
};

/** Cents-accurate rounding (mirrors postInvoice.round2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Map the captured per-line PST `taxFlag` to an EXPLICIT tax treatment.
 *
 * The extractor only captures a boolean PST flag, so GST is inferred from it:
 *  - true  → carries PST (and, on a GST bill, GST too)         → "gst_pst"
 *  - false → PST NOT charged; treated as GST-only (the common  → "gst_only"
 *            Canadian supplier line where GST always applies)
 *  - null  → unknown / no tax captured                         → "exempt"
 *
 * A caller that KNOWS a line is fully exempt (even on a GST bill) can bypass this
 * heuristic and pass "exempt" to {@link lineTaxKey} directly — that is how the
 * "exempt vs GST-only" ambiguity is resolved correctly (QBO-H3, #186).
 */
export function taxFlagTreatment(taxFlag: boolean | null): LineTaxTreatment {
  if (taxFlag === true) return "gst_pst";
  if (taxFlag === false) return "gst_only";
  return "exempt";
}

/**
 * Resolve a line's Canadian tax key from its tax treatment and the header totals.
 *
 * Accepts EITHER the legacy captured PST `taxFlag` (boolean | null — mapped via
 * {@link taxFlagTreatment}) OR an explicit {@link LineTaxTreatment}. The header
 * gates the result so we never invent a component the BILL did not charge; an
 * explicit "exempt" treatment always resolves to null, even on a fully taxed
 * bill (QBO-H3, #186 — fixes a `false` line wrongly keying GST when it is exempt).
 *
 *  - gst_pst  + bill has GST + PST → "GST_PST"  (PST-only bill → "PST")
 *  - gst_only + bill has GST       → "GST"
 *  - pst_only + bill has PST       → "PST"
 *  - exempt                        → null       (unconditional)
 *  - any treatment, component the bill didn't charge → dropped
 */
export function lineTaxKey(
  treatment: boolean | null | LineTaxTreatment,
  header: { gst: number | null; pst: number | null }
): LineTaxKey {
  const t: LineTaxTreatment =
    typeof treatment === "string" ? treatment : taxFlagTreatment(treatment);
  if (t === "exempt") return null;

  const billHasGst = (header.gst ?? 0) > 0;
  const billHasPst = (header.pst ?? 0) > 0;
  const wantsGst = t === "gst_pst" || t === "gst_only";
  const wantsPst = t === "gst_pst" || t === "pst_only";
  const gst = wantsGst && billHasGst;
  const pst = wantsPst && billHasPst;

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
 * STRICT resolve for a `TxnTaxDetail.TaxLine.TaxRateRef` (QBO-H3, #186). Returns
 * a ref ONLY when a real **TaxRate** id is mapped — never falls back to the
 * label or to a TaxCode id, because a wrong TaxRateRef is exactly what makes a
 * Canadian Bill mis-book. `null` here means "no TaxRate mapping" (the caller
 * leaves the ref out rather than guessing).
 */
function resolveTaxRateRef(
  localKey: string,
  lookup: Record<string, string> | undefined
): QboRef | null {
  const id = lookup?.[localKey];
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
  const { centralVendorRef, maps, taxMode = "line-codes" } = options;

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
  //
  // QBO-H3 (#186): in the default AST-safe "line-codes" mode we DON'T emit a
  // manual TxnTaxDetail at all — QBO's Automatic Sales Tax computes GST + PST
  // from each line's TaxCodeRef. A manual TaxLine sent to an AST company is the
  // #1 misbooking risk. Only the "manual-detail" mode (a confirmed non-AST
  // company) emits an explicit TxnTaxDetail, and there each TaxLine's TaxRateRef
  // is a REAL TaxRate id from `taxRateByLocal` — never a TaxCode id.
  const gst = invoice.gst;
  const pst = invoice.pst;

  let txnTaxDetail: QboBill["TxnTaxDetail"];
  if (taxMode === "manual-detail") {
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
    txnTaxDetail = { TotalTax: addNullable(gst, pst), TaxLine: taxLine };
  }

  const bill: QboBill = {
    VendorRef: vendorRef,
    TxnDate: invoice.issueDate,
    DueDate: invoice.dueDate,
    DocNumber: invoice.invoiceNumber,
    PrivateNote: invoice.poRef,
    GlobalTaxCalculation: "TaxExcluded",
    Line: billLines,
    ...(txnTaxDetail ? { TxnTaxDetail: txnTaxDetail } : {}),
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
    computedTotal,
    statedTotal,
    balanced: statedTotal != null && Math.abs(computedTotal - statedTotal) < 0.01,
  };

  return {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    bill,
    reconciliation,
  };
}
