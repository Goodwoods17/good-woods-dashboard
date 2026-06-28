/**
 * Invoice capture & extraction types (milestone #4, slice 1 tracer).
 * Glossary: features/invoices/CONTEXT.md. Engine decision: ADR 0019.
 *
 * Taxes are NEVER collapsed — pre-tax + GST + PST are stored separately, plus a
 * per-line tax flag. Validated in TS (status / file kind are string unions, not
 * DB enums) so the vocabulary can evolve without a migration.
 */

/** `pending` (captured) → `needs_review` (extracted) → `reviewed` → `posted`. Plus `error`. */
export type InvoiceStatus = "pending" | "needs_review" | "reviewed" | "posted" | "error";

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "pending",
  "needs_review",
  "reviewed",
  "posted",
  "error",
];

/** Accepted capture file kinds (ADR 0019). */
export type InvoiceFileMime = "application/pdf" | "image/jpeg" | "image/png" | "image/heic";

/** A captured supplier bill (one stored file + its extracted header). */
export type Invoice = {
  id: string;
  status: InvoiceStatus;
  // Storage handle (path within the private invoices bucket) + original mime/name.
  storagePath: string;
  mime: string | null;
  originalFilename: string | null;
  // Extracted header (null until extraction fills it). Taxes never collapsed.
  supplier: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  poRef: string | null;
  preTaxTotal: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
  // Raw extracted JSON, kept verbatim for the slice-1 raw view + auditing.
  extractedJson: ExtractedInvoice | null;
  // Captured when extraction fails after bounded retry (slice 2 surfaces it).
  errorMessage: string | null;
  // Slice 4: resolved catalog supplier (null until the match step fills it).
  supplierId: string | null;
  // Slice 7: additional page paths for multi-page camera captures. Null for
  // single-file uploads. storage_path always points to page 1.
  pages: string[] | null;
  // Slice 8: QBO vendor mapping (null until the owner sets it). Maps to
  // QBO Bill VendorRef.value for the future QuickBooks sync phase.
  qboVendorId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One row of a supplier bill. */
export type InvoiceLine = {
  id: string;
  invoiceId: string;
  lineNo: number;
  qty: number | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
  // True when this line was charged PST (invoices carry codes like Reimer's "PGST").
  taxFlag: boolean | null;
  // Per-field extraction confidence 0..1 (amber-highlights low fields in slice 3).
  confidence: number | null;
  // Slice 4: job this line is assigned to (null = "no job / shop stock").
  jobId: string | null;
  // Slice 8: QBO expense account code (null until owner assigns it). Maps to
  // QBO Bill AccountBasedExpenseLineDetail.AccountRef.value.
  qboAccount: string | null;
  // QBO S5 (#151): cost kind this line books as. null = material (the default,
  // so untagged lines keep the historical material behaviour). Drives
  // job_cost_actuals.kind + the QBO Bill bucket so subtrade bills don't
  // mis-book as material.
  lineKind: InvoiceLineKind | null;
  createdAt: string;
};

/** Cost kind a posted invoice line books as (mirrors job_cost_actuals.kind). */
export type InvoiceLineKind = "material" | "subtrade";

/**
 * The strict shape the extraction engine (ADR 0019) must return. This is the
 * contract validated by `parseExtractedInvoice` before anything is written to
 * Supabase — the riskiest assumption this tracer proves.
 */
export type ExtractedInvoiceLine = {
  qty: number | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unitPrice: number | null;
  amount: number | null;
  taxFlag: boolean | null;
  confidence: number | null;
};

export type ExtractedInvoice = {
  supplier: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  poRef: string | null;
  preTaxTotal: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
  lines: ExtractedInvoiceLine[];
};
