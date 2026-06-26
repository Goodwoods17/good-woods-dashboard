import type { ExtractedInvoice, Invoice, InvoiceLine, InvoiceStatus } from "./types";

/** Shape of an `invoices` table row (snake_case, as PostgREST returns it). */
export type InvoiceRow = {
  id: string;
  status: string;
  storage_path: string;
  mime: string | null;
  original_filename: string | null;
  supplier: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  po_ref: string | null;
  pre_tax_total: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
  extracted_json: ExtractedInvoice | null;
  error_message: string | null;
  // Slice 4: resolved catalog supplier FK (nullable until match step).
  supplier_id: string | null;
  // Slice 7: multi-page camera capture paths (null for single-file uploads).
  pages: string[] | null;
  // Slice 8: QBO vendor mapping (null until owner sets it).
  qbo_vendor_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Shape of an `invoice_lines` table row. */
export type InvoiceLineRow = {
  id: string;
  invoice_id: string;
  line_no: number;
  qty: number | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  tax_flag: boolean | null;
  confidence: number | null;
  // Slice 4: job assignment FK (null = shop stock).
  job_id: string | null;
  // Slice 8: QBO expense account code (null until owner assigns it).
  qbo_account: string | null;
  created_at: string;
};

export function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    status: row.status as InvoiceStatus,
    storagePath: row.storage_path,
    mime: row.mime,
    originalFilename: row.original_filename,
    supplier: row.supplier,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    poRef: row.po_ref,
    preTaxTotal: row.pre_tax_total,
    gst: row.gst,
    pst: row.pst,
    total: row.total,
    extractedJson: row.extracted_json,
    errorMessage: row.error_message,
    supplierId: row.supplier_id ?? null,
    pages: row.pages ?? null,
    qboVendorId: row.qbo_vendor_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToInvoiceLine(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    lineNo: row.line_no,
    qty: row.qty,
    sku: row.sku,
    description: row.description,
    unit: row.unit,
    unitPrice: row.unit_price,
    amount: row.amount,
    taxFlag: row.tax_flag,
    confidence: row.confidence,
    jobId: row.job_id ?? null,
    qboAccount: row.qbo_account ?? null,
    createdAt: row.created_at,
  };
}

/** The columns set when a file is captured (status `pending`). */
export type InvoiceInsertRow = {
  status: InvoiceStatus;
  storage_path: string;
  mime: string | null;
  original_filename: string | null;
};

/** Build the insert row for a fresh capture. Header fields are left to the DB (null). */
export function invoiceToInsertRow(
  inv: Pick<Invoice, "status" | "storagePath" | "mime" | "originalFilename">
): InvoiceInsertRow {
  return {
    status: inv.status,
    storage_path: inv.storagePath,
    mime: inv.mime,
    original_filename: inv.originalFilename,
  };
}
