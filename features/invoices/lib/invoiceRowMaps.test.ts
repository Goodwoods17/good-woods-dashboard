import { describe, it, expect } from "vitest";
import {
  rowToInvoice,
  invoiceToInsertRow,
  rowToInvoiceLine,
  type InvoiceRow,
  type InvoiceLineRow,
} from "./invoiceRowMaps";
import type { Invoice } from "./types";

const invoiceRow: InvoiceRow = {
  id: "inv-1",
  status: "needs_review",
  storage_path: "inv-1/bill.pdf",
  mime: "application/pdf",
  original_filename: "bill.pdf",
  supplier: "Reimer Hardwoods",
  invoice_number: "R-10293",
  issue_date: "2026-05-12",
  due_date: "2026-06-11",
  po_ref: "PO-7781",
  pre_tax_total: 1000,
  gst: 50,
  pst: 70,
  total: 1120,
  extracted_json: { supplier: "Reimer Hardwoods", lines: [] } as never,
  error_message: null,
  // Slice 4: supplier link — null until match step fills it.
  supplier_id: null,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T01:00:00Z",
};

const lineRow: InvoiceLineRow = {
  id: "line-1",
  invoice_id: "inv-1",
  line_no: 0,
  qty: 4,
  sku: "MAPLE-34",
  description: "Hard maple 3/4 sheet",
  unit: "sheet",
  unit_price: 200,
  amount: 800,
  tax_flag: true,
  confidence: 0.98,
  // Slice 4: job assignment — null until match step fills it.
  job_id: null,
  created_at: "2026-06-25T00:00:00Z",
};

describe("rowToInvoice", () => {
  it("maps snake_case columns to the camelCase domain type", () => {
    const inv = rowToInvoice(invoiceRow);
    expect(inv.id).toBe("inv-1");
    expect(inv.status).toBe("needs_review");
    expect(inv.storagePath).toBe("inv-1/bill.pdf");
    expect(inv.originalFilename).toBe("bill.pdf");
    expect(inv.invoiceNumber).toBe("R-10293");
    expect(inv.issueDate).toBe("2026-05-12");
    expect(inv.poRef).toBe("PO-7781");
    expect(inv.preTaxTotal).toBe(1000);
    expect(inv.total).toBe(1120);
    expect(inv.createdAt).toBe("2026-06-25T00:00:00Z");
    expect(inv.updatedAt).toBe("2026-06-25T01:00:00Z");
  });
});

describe("rowToInvoiceLine", () => {
  it("maps a line row to the camelCase domain type", () => {
    const line = rowToInvoiceLine(lineRow);
    expect(line.invoiceId).toBe("inv-1");
    expect(line.lineNo).toBe(0);
    expect(line.qty).toBe(4);
    expect(line.sku).toBe("MAPLE-34");
    expect(line.unitPrice).toBe(200);
    expect(line.taxFlag).toBe(true);
    expect(line.confidence).toBe(0.98);
  });
});

describe("invoiceToInsertRow (capture)", () => {
  it("builds a minimal pending-capture insert row (header fields null)", () => {
    const row = invoiceToInsertRow({
      status: "pending",
      storagePath: "inv-x/photo.jpg",
      mime: "image/jpeg",
      originalFilename: "photo.jpg",
    });
    expect(row.status).toBe("pending");
    expect(row.storage_path).toBe("inv-x/photo.jpg");
    expect(row.mime).toBe("image/jpeg");
    expect(row.original_filename).toBe("photo.jpg");
    // No header values at capture time — the DB defaults / nulls take over.
    expect("supplier" in row).toBe(false);
    expect("total" in row).toBe(false);
  });
});

// Round-trip sanity: a domain Invoice → row → domain keeps identity on the
// fields a capture sets.
describe("round-trip", () => {
  it("preserves the capture-relevant fields", () => {
    const inv = rowToInvoice(invoiceRow);
    const partial: Pick<Invoice, "status" | "storagePath" | "mime" | "originalFilename"> = {
      status: inv.status,
      storagePath: inv.storagePath,
      mime: inv.mime,
      originalFilename: inv.originalFilename,
    };
    const back = invoiceToInsertRow(partial);
    expect(back.status).toBe("needs_review");
    expect(back.storage_path).toBe("inv-1/bill.pdf");
  });
});
