/**
 * Unit tests for Slice 8 QBO export logic — written first (TDD, red→green).
 * Pure functions: no Supabase, no React, no QBO API calls.
 */
import { describe, it, expect } from "vitest";
import { buildQboExport, type QboBillExport } from "./qboExport";
import type { Invoice, InvoiceLine } from "./types";

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const baseInvoice: Pick<
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
> = {
  id: "inv-001",
  status: "reviewed",
  qboVendorId: "qbo-vendor-99",
  supplier: "Reimer Hardwoods",
  invoiceNumber: "R-10293",
  issueDate: "2026-05-12",
  dueDate: "2026-06-11",
  poRef: "PO-7781",
  preTaxTotal: 1000,
  gst: 50,
  pst: 70,
  total: 1120,
};

const baseLine: Pick<
  InvoiceLine,
  "lineNo" | "description" | "amount" | "sku" | "taxFlag" | "qboAccount" | "lineKind"
> = {
  lineNo: 0,
  description: "Hard maple 3/4 sheet",
  amount: 800,
  sku: "MAPLE-34",
  taxFlag: true,
  qboAccount: "5000-Materials",
  lineKind: null,
};

const baseLine2: Pick<
  InvoiceLine,
  "lineNo" | "description" | "amount" | "sku" | "taxFlag" | "qboAccount" | "lineKind"
> = {
  lineNo: 1,
  description: "Finishing supplies (GST only)",
  amount: 200,
  sku: "FIN-01",
  taxFlag: false,
  qboAccount: "5010-Supplies",
  lineKind: null,
};

// ---------------------------------------------------------------------------
// buildQboExport — header mapping
// ---------------------------------------------------------------------------

describe("buildQboExport — header", () => {
  it("maps internal ids through", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.invoiceId).toBe("inv-001");
    expect(result.invoiceStatus).toBe("reviewed");
  });

  it("maps vendor ref + name", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.vendorRef).toBe("qbo-vendor-99");
    expect(result.vendorName).toBe("Reimer Hardwoods");
  });

  it("maps docNumber from invoiceNumber", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.docNumber).toBe("R-10293");
  });

  it("maps txnDate from issueDate and dueDate", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.txnDate).toBe("2026-05-12");
    expect(result.dueDate).toBe("2026-06-11");
  });

  it("maps privateNote from poRef", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.privateNote).toBe("PO-7781");
  });

  it("preserves split tax amounts (never collapsed, ADR 0019)", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.preTaxTotal).toBe(1000);
    expect(result.gst).toBe(50);
    expect(result.pst).toBe(70);
    expect(result.totalAmt).toBe(1120);
  });

  it("computes totalTax as gst + pst", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.totalTax).toBe(120); // 50 + 70
  });

  it("returns null totalTax when both gst and pst are null", () => {
    const result = buildQboExport({ ...baseInvoice, gst: null, pst: null }, []);
    expect(result.totalTax).toBeNull();
  });

  it("computes totalTax from gst only when pst is null", () => {
    const result = buildQboExport({ ...baseInvoice, pst: null }, []);
    expect(result.totalTax).toBe(50);
  });

  it("passes through null qboVendorId (not yet mapped)", () => {
    const result = buildQboExport({ ...baseInvoice, qboVendorId: null }, []);
    expect(result.vendorRef).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildQboExport — line mapping
// ---------------------------------------------------------------------------

describe("buildQboExport — lines", () => {
  it("maps a single taxable line to TAX taxCodeRef", () => {
    const result = buildQboExport(baseInvoice, [baseLine]);
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.lineNum).toBe(0);
    expect(line.description).toBe("Hard maple 3/4 sheet");
    expect(line.amount).toBe(800);
    expect(line.accountRef).toBe("5000-Materials");
    expect(line.taxCodeRef).toBe("TAX");
    expect(line.sku).toBe("MAPLE-34");
  });

  it("maps a non-taxable line to NON taxCodeRef", () => {
    const result = buildQboExport(baseInvoice, [baseLine2]);
    expect(result.lines[0].taxCodeRef).toBe("NON");
  });

  it("maps null taxFlag to NON (absence of PST flag = non-taxable)", () => {
    const result = buildQboExport(baseInvoice, [{ ...baseLine, taxFlag: null }]);
    expect(result.lines[0].taxCodeRef).toBe("NON");
  });

  it("maps null qboAccount through (not yet assigned)", () => {
    const result = buildQboExport(baseInvoice, [{ ...baseLine, qboAccount: null }]);
    expect(result.lines[0].accountRef).toBeNull();
  });

  it("preserves order and maps all lines", () => {
    const result = buildQboExport(baseInvoice, [baseLine, baseLine2]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].lineNum).toBe(0);
    expect(result.lines[1].lineNum).toBe(1);
  });

  it("returns an empty lines array for an invoice with no lines", () => {
    const result = buildQboExport(baseInvoice, []);
    expect(result.lines).toEqual([]);
  });

  // QBO S5 (#151): the line's kind tag threads onto the bill so a subtrade line
  // books to the subtrade account/bucket, not material.
  it("defaults an untagged line's kind to material", () => {
    const result = buildQboExport(baseInvoice, [baseLine]);
    expect(result.lines[0].kind).toBe("material");
  });

  it("threads a subtrade-tagged line's kind onto the bill", () => {
    const result = buildQboExport(baseInvoice, [{ ...baseLine, lineKind: "subtrade" }]);
    expect(result.lines[0].kind).toBe("subtrade");
  });

  it("resolves kind per line on a mixed bill", () => {
    const result = buildQboExport(baseInvoice, [
      { ...baseLine, lineKind: "material" },
      { ...baseLine2, lineKind: "subtrade" },
    ]);
    expect(result.lines.map((l) => l.kind)).toEqual(["material", "subtrade"]);
  });
});

// ---------------------------------------------------------------------------
// QboBillExport shape — all required fields present
// ---------------------------------------------------------------------------

describe("QboBillExport shape completeness", () => {
  it("export contains all fields needed to construct a QBO Bill", () => {
    const result: QboBillExport = buildQboExport(baseInvoice, [baseLine]);
    // These are the fields a QBO sync layer needs — none may be absent.
    expect("invoiceId" in result).toBe(true);
    expect("invoiceStatus" in result).toBe(true);
    expect("vendorRef" in result).toBe(true);
    expect("vendorName" in result).toBe(true);
    expect("docNumber" in result).toBe(true);
    expect("txnDate" in result).toBe(true);
    expect("dueDate" in result).toBe(true);
    expect("privateNote" in result).toBe(true);
    expect("preTaxTotal" in result).toBe(true);
    expect("gst" in result).toBe(true);
    expect("pst" in result).toBe(true);
    expect("totalAmt" in result).toBe(true);
    expect("totalTax" in result).toBe(true);
    expect("lines" in result).toBe(true);
  });

  it("each line contains all QBO AccountBasedExpenseLineDetail fields", () => {
    const result = buildQboExport(baseInvoice, [baseLine]);
    const line = result.lines[0];
    expect("lineNum" in line).toBe(true);
    expect("description" in line).toBe(true);
    expect("amount" in line).toBe(true);
    expect("accountRef" in line).toBe(true);
    expect("taxCodeRef" in line).toBe(true);
    expect("sku" in line).toBe(true);
    expect("kind" in line).toBe(true);
  });

  // QBO S2 (issue #148): the central quickbooks_links mapping is the source of
  // truth for VendorRef; the legacy embedded column is back-compat fallback.
  it("central quickbooks_links vendor ref WINS over the embedded qbo_vendor_id", () => {
    const result = buildQboExport(baseInvoice, [baseLine], "qbo-central-7");
    expect(result.vendorRef).toBe("qbo-central-7");
  });

  it("falls back to the embedded qbo_vendor_id when no central link is given", () => {
    expect(buildQboExport(baseInvoice, [baseLine]).vendorRef).toBe("qbo-vendor-99");
    expect(buildQboExport(baseInvoice, [baseLine], null).vendorRef).toBe("qbo-vendor-99");
  });
});
