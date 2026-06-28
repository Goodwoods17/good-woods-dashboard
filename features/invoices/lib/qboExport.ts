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
  TxnTaxDetail: {
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
};

/** Cents-accurate rounding (mirrors postInvoice.round2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Classify a line's Canadian tax from its PST flag and the header's tax totals.
 *
 * The extractor only captures a per-line PST flag (`taxFlag`), so GST is
 * inferred: a line that isn't non-taxable carries GST whenever the BILL carries
 * GST. The header totals therefore gate the result — we never invent a GST or
 * PST component the bill didn't actually charge.
 *
 *  - taxFlag true  + bill has GST + PST → "GST_PST"
 *  - taxFlag true  + bill has PST only → "PST"
 *  - taxFlag false + bill has GST      → "GST"   (the "(GST only)" line)
 *  - taxFlag null  (unknown)           → null    (non-taxable)
 *  - bill charges neither tax           → null
 */
export function lineTaxKey(
  taxFlag: boolean | null,
  header: { gst: number | null; pst: number | null }
): LineTaxKey {
  if (taxFlag == null) return null;
  const billHasGst = (header.gst ?? 0) > 0;
  const billHasPst = (header.pst ?? 0) > 0;
  const pst = taxFlag === true && billHasPst;
  // A taxable line (flag not null) carries GST whenever the bill does.
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
  const { centralVendorRef, maps } = options;

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
      TaxLineDetail: { NetAmountTaxable: gstBase, TaxRateRef: resolveRef("GST", maps?.taxByLocal) },
      _component: "GST",
    });
  }
  if (pst != null && pst !== 0) {
    taxLine.push({
      Amount: pst,
      DetailType: "TaxLineDetail",
      TaxLineDetail: { NetAmountTaxable: pstBase, TaxRateRef: resolveRef("PST", maps?.taxByLocal) },
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
    TxnTaxDetail: {
      TotalTax: addNullable(gst, pst),
      TaxLine: taxLine,
    },
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
