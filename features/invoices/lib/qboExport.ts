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
  vendorRef: string | null;   // invoice.qboVendorId → VendorRef.value
  vendorName: string | null;  // invoice.supplier    → VendorRef.name (display)
  // QBO Bill header fields.
  docNumber: string | null;   // invoice.invoiceNumber
  txnDate: string | null;     // invoice.issueDate
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
    "lineNo" | "description" | "amount" | "sku" | "taxFlag" | "qboAccount"
  >[]
): QboBillExport {
  return {
    invoiceId: invoice.id,
    invoiceStatus: invoice.status,
    vendorRef: invoice.qboVendorId,
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
    })),
  };
}
