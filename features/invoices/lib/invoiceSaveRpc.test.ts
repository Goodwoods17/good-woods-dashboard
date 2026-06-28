/**
 * Unit tests for the transactional-save RPC arg builders (issue #171) —
 * written first (TDD). Pure functions: no Supabase, no React.
 *
 * Why this exists: `saveReviewedInvoice` / `saveInvoiceMatch` used to fire the
 * header update + N per-line updates as separate round-trips (Promise.all), so a
 * mid-batch failure left the invoice half-saved (header flipped, some lines
 * stale). The fix routes both saves through a single Postgres RPC (one
 * transaction). These builders translate the camelCase UI payload into the
 * snake_case jsonb the RPC expects — the only piece worth unit-testing in
 * isolation; the atomicity itself is proven by the migration + e2e.
 */
import { describe, it, expect } from "vitest";
import { buildSaveReviewedArgs, buildSaveMatchArgs } from "./invoiceSaveRpc";

describe("buildSaveReviewedArgs", () => {
  const header = {
    supplier: "Windsor Plywood",
    invoiceNumber: "WP-1234",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    poRef: "PO-9",
    preTaxTotal: 1000,
    gst: 50,
    pst: 70,
    total: 1120,
  };

  it("maps the header to snake_case under p_header", () => {
    const args = buildSaveReviewedArgs("inv-1", header, []);
    expect(args.p_invoice_id).toBe("inv-1");
    expect(args.p_header).toEqual({
      supplier: "Windsor Plywood",
      invoice_number: "WP-1234",
      issue_date: "2026-06-01",
      due_date: "2026-06-30",
      po_ref: "PO-9",
      pre_tax_total: 1000,
      gst: 50,
      pst: 70,
      total: 1120,
    });
  });

  it("preserves nulls in the header (a cleared field must not be dropped)", () => {
    const args = buildSaveReviewedArgs("inv-1", { ...header, poRef: null, pst: null }, []);
    expect(args.p_header.po_ref).toBeNull();
    expect(args.p_header.pst).toBeNull();
  });

  it("maps every line to snake_case under p_lines (all rows, in order)", () => {
    const args = buildSaveReviewedArgs("inv-1", header, [
      {
        id: "l1",
        qty: 5,
        sku: "MAPLE-34",
        description: "Hard maple",
        unit: "sheet",
        unitPrice: 200,
        amount: 1000,
        taxFlag: true,
      },
      {
        id: "l2",
        qty: 2,
        sku: null,
        description: "Glue",
        unit: "tube",
        unitPrice: 5,
        amount: 10,
        taxFlag: false,
      },
    ]);
    expect(args.p_lines).toEqual([
      {
        id: "l1",
        qty: 5,
        sku: "MAPLE-34",
        description: "Hard maple",
        unit: "sheet",
        unit_price: 200,
        amount: 1000,
        tax_flag: true,
      },
      {
        id: "l2",
        qty: 2,
        sku: null,
        description: "Glue",
        unit: "tube",
        unit_price: 5,
        amount: 10,
        tax_flag: false,
      },
    ]);
  });
});

describe("buildSaveMatchArgs", () => {
  it("maps supplier + line assignments to snake_case", () => {
    const args = buildSaveMatchArgs("inv-2", "sup-1", [
      { lineId: "l1", jobId: "job-1", lineKind: "subtrade" },
      { lineId: "l2", jobId: null },
    ]);
    expect(args.p_invoice_id).toBe("inv-2");
    expect(args.p_supplier_id).toBe("sup-1");
    expect(args.p_lines).toEqual([
      { id: "l1", job_id: "job-1", line_kind: "subtrade" },
      { id: "l2", job_id: null, line_kind: null },
    ]);
  });

  it("defaults a missing lineKind to null (NULL = material downstream)", () => {
    const args = buildSaveMatchArgs("inv-2", null, [{ lineId: "l1", jobId: "job-1" }]);
    expect(args.p_supplier_id).toBeNull();
    expect(args.p_lines[0].line_kind).toBeNull();
  });
});
