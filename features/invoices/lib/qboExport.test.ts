/**
 * Unit tests for Slice 8 QBO export logic — written first (TDD, red→green).
 * Pure functions: no Supabase, no React, no QBO API calls.
 */
import { describe, it, expect } from "vitest";
import {
  buildQboExport,
  buildQboBill,
  lineTaxKey,
  taxFlagTreatment,
  type QboBillExport,
} from "./qboExport";
import type { MappingLookups } from "./qboAccountMapping";
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
  | "id"
  | "lineNo"
  | "description"
  | "amount"
  | "sku"
  | "taxFlag"
  | "qboAccount"
  | "lineKind"
  | "jobId"
> = {
  id: "line-a",
  lineNo: 0,
  description: "Hard maple 3/4 sheet",
  amount: 800,
  sku: "MAPLE-34",
  taxFlag: true,
  qboAccount: "5000-Materials",
  lineKind: null,
  jobId: null,
};

const baseLine2: Pick<
  InvoiceLine,
  | "id"
  | "lineNo"
  | "description"
  | "amount"
  | "sku"
  | "taxFlag"
  | "qboAccount"
  | "lineKind"
  | "jobId"
> = {
  id: "line-b",
  lineNo: 1,
  description: "Finishing supplies (GST only)",
  amount: 200,
  sku: "FIN-01",
  taxFlag: false,
  qboAccount: "5010-Supplies",
  lineKind: null,
  jobId: null,
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

// ===========================================================================
// QBO S6 (#152) — buildQboBill: the REAL QBO v3 Bill payload
// ===========================================================================
// Unlike buildQboExport (a flat mappable shape), buildQboBill emits the actual
// QBO v3 Bill request body: VendorRef, Line[] with AccountBasedExpenseLineDetail
// (AccountRef + per-line TaxCodeRef), and a TxnTaxDetail whose GST and PST stay
// as TWO SEPARATE TaxLines (never collapsed — ADR 0019). It also returns a
// reconciliation: Σ pre-tax lines + GST + PST must equal the stated total.

// --- lineTaxKey: derive a line's tax key from its PST flag × header tax -------
describe("lineTaxKey — per-line GST/PST classification (replaces hardcoded TAX/NON)", () => {
  it("a PST-charged line on a GST+PST bill is GST_PST", () => {
    expect(lineTaxKey(true, { gst: 50, pst: 70 })).toBe("GST_PST");
  });

  it("a non-PST line on a GST+PST bill is GST-only (the '(GST only)' case)", () => {
    expect(lineTaxKey(false, { gst: 50, pst: 70 })).toBe("GST");
  });

  it("an unknown (null) tax flag is non-taxable", () => {
    expect(lineTaxKey(null, { gst: 50, pst: 70 })).toBeNull();
  });

  it("a PST line on a GST-zero bill is PST-only (never invents GST)", () => {
    expect(lineTaxKey(true, { gst: 0, pst: 70 })).toBe("PST");
  });

  it("any line on a fully tax-free bill is non-taxable", () => {
    expect(lineTaxKey(true, { gst: 0, pst: 0 })).toBeNull();
    expect(lineTaxKey(false, { gst: 0, pst: 0 })).toBeNull();
  });

  it("a non-PST line on a GST-zero / PST-only bill is non-taxable", () => {
    expect(lineTaxKey(false, { gst: 0, pst: 70 })).toBeNull();
  });
});

// QBO-H3 (#186): the boolean PST flag conflates "GST-only" with "exempt". An
// explicit LineTaxTreatment lets a caller mark a line fully exempt even on a
// taxed bill, so its NetAmountTaxable is no longer wrongly inflated.
describe("lineTaxKey — explicit tax treatment (exempt vs GST-only, QBO-H3)", () => {
  it("an explicit 'exempt' line is non-taxable EVEN on a GST+PST bill", () => {
    // This is the bug: a `false`-flag line keys GST; an explicit exempt must not.
    expect(lineTaxKey("exempt", { gst: 50, pst: 70 })).toBeNull();
  });

  it("an explicit 'gst_only' line keys GST on a GST bill", () => {
    expect(lineTaxKey("gst_only", { gst: 50, pst: 70 })).toBe("GST");
  });

  it("an explicit 'gst_pst' line keys GST_PST on a GST+PST bill", () => {
    expect(lineTaxKey("gst_pst", { gst: 50, pst: 70 })).toBe("GST_PST");
  });

  it("an explicit 'pst_only' line keys PST, and is null when the bill has no PST", () => {
    expect(lineTaxKey("pst_only", { gst: 50, pst: 70 })).toBe("PST");
    expect(lineTaxKey("pst_only", { gst: 50, pst: 0 })).toBeNull();
  });

  it("a 'gst_only' line is null when the bill charged no GST (never invents tax)", () => {
    expect(lineTaxKey("gst_only", { gst: 0, pst: 70 })).toBeNull();
  });

  it("taxFlagTreatment maps the captured PST flag: true→gst_pst, false→gst_only, null→exempt", () => {
    expect(taxFlagTreatment(true)).toBe("gst_pst");
    expect(taxFlagTreatment(false)).toBe("gst_only");
    expect(taxFlagTreatment(null)).toBe("exempt");
  });
});

// Persisted local→QBO id lookups (S4/S5). With these, AccountRef + TaxCodeRef
// resolve to REAL per-company QBO ids instead of the raw local labels.
const maps: MappingLookups = {
  accountByLocal: {
    "5000-Materials": "qbo-acct-50",
    "5100-Subcontractors": "qbo-acct-51",
    "5010-Supplies": "qbo-acct-501",
  },
  taxByLocal: {
    GST: "qbo-tax-G",
    PST: "qbo-tax-P",
    GST_PST: "qbo-tax-GP",
  },
  // QBO-H3 (#186): real TaxRate ids — a DIFFERENT entity from the TaxCode ids in
  // taxByLocal. Only consulted in manual-detail mode's TxnTaxDetail.TaxRateRef.
  taxRateByLocal: {
    GST: "qbo-rate-G",
    PST: "qbo-rate-P",
  },
};

describe("buildQboBill — header + vendor", () => {
  it("emits a QBO Bill with VendorRef (central link wins over embedded)", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { centralVendorRef: "qbo-central-7" });
    expect(bill.VendorRef).toEqual({ value: "qbo-central-7", name: "Reimer Hardwoods" });
  });

  it("falls back to the embedded qbo_vendor_id when no central link", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine]);
    expect(bill.VendorRef?.value).toBe("qbo-vendor-99");
  });

  it("maps the header fields to QBO Bill conventions", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine]);
    expect(bill.TxnDate).toBe("2026-05-12");
    expect(bill.DueDate).toBe("2026-06-11");
    expect(bill.DocNumber).toBe("R-10293");
    expect(bill.PrivateNote).toBe("PO-7781");
  });

  it("uses TaxExcluded global tax calc (line amounts are pre-tax — ADR 0019)", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine]);
    expect(bill.GlobalTaxCalculation).toBe("TaxExcluded");
  });
});

describe("buildQboBill — lines: account + tax never collapsed", () => {
  it("resolves a material line's AccountRef + GST_PST TaxCodeRef from the maps", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps });
    expect(bill.Line).toHaveLength(1);
    const detail = bill.Line[0].AccountBasedExpenseLineDetail;
    expect(detail.AccountRef).toEqual({ value: "qbo-acct-50" });
    expect(detail.TaxCodeRef).toEqual({ value: "qbo-tax-GP" });
    expect(bill.Line[0].Amount).toBe(800);
    expect(bill.Line[0].DetailType).toBe("AccountBasedExpenseLineDetail");
  });

  it("a GST-only line gets the GST TaxCodeRef, not GST_PST", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine2], { maps });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "qbo-tax-G" });
  });

  it("a non-taxable (null flag) line gets a null TaxCodeRef", () => {
    const { bill } = buildQboBill(baseInvoice, [{ ...baseLine, taxFlag: null }], { maps });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toBeNull();
  });

  it("books material AND subtrade lines to their correct accounts + threads kind", () => {
    const materialLine = {
      ...baseLine,
      qboAccount: "5000-Materials",
      lineKind: "material" as const,
    };
    const subLine = {
      ...baseLine2,
      lineNo: 1,
      description: "Spray finishing — subtrade",
      qboAccount: "5100-Subcontractors",
      taxFlag: true,
      lineKind: "subtrade" as const,
    };
    const { bill } = buildQboBill(baseInvoice, [materialLine, subLine], { maps });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.AccountRef?.value).toBe("qbo-acct-50");
    expect(bill.Line[0]._kind).toBe("material");
    expect(bill.Line[1].AccountBasedExpenseLineDetail.AccountRef?.value).toBe("qbo-acct-51");
    expect(bill.Line[1]._kind).toBe("subtrade");
  });

  it("falls back to the raw local labels when no maps are supplied (pre-mapping)", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine]);
    expect(bill.Line[0].AccountBasedExpenseLineDetail.AccountRef).toEqual({
      value: "5000-Materials",
    });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "GST_PST" });
  });

  it("INCLUDES a no-job (shop-stock) line on the bill, marked NotBillable", () => {
    // Shop-stock (jobId null) lines are skipped from job ACTUALS but still
    // belong on the supplier bill — the bill is the whole invoice.
    const shopStock = { ...baseLine, jobId: null };
    const { bill } = buildQboBill(baseInvoice, [shopStock], { maps });
    expect(bill.Line).toHaveLength(1);
    expect(bill.Line[0].AccountBasedExpenseLineDetail.CustomerRef).toBeNull();
    expect(bill.Line[0].AccountBasedExpenseLineDetail.BillableStatus).toBe("NotBillable");
    expect(bill.Line[0]._jobId).toBeNull();
  });

  it("marks a job-assigned line Billable with a CustomerRef", () => {
    const jobLine = { ...baseLine, jobId: "job-123" };
    const { bill } = buildQboBill(baseInvoice, [jobLine], { maps });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.CustomerRef).toEqual({ value: "job-123" });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.BillableStatus).toBe("Billable");
  });
});

// QBO-H3 (#186): the manual TxnTaxDetail split is now ONLY emitted in the
// "manual-detail" tax mode (a confirmed non-AST company). These tests pin that
// split + its NetAmountTaxable bases.
describe("buildQboBill (manual-detail) — TxnTaxDetail keeps GST and PST as two lines", () => {
  it("emits two TaxLines (GST + PST), never a single collapsed total", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps, taxMode: "manual-detail" });
    expect(bill.TxnTaxDetail?.TotalTax).toBe(120);
    const components = bill.TxnTaxDetail?.TaxLine.map((t) => t._component).sort();
    expect(components).toEqual(["GST", "PST"]);
    const gstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "PST");
    expect(gstLine?.Amount).toBe(50);
    expect(pstLine?.Amount).toBe(70);
  });

  it("omits a zero/absent tax component (a GST-only bill has no PST TaxLine)", () => {
    const gstOnly = { ...baseInvoice, pst: 0, total: 1050 };
    const { bill } = buildQboBill(gstOnly, [baseLine2], { maps, taxMode: "manual-detail" });
    expect(bill.TxnTaxDetail?.TaxLine.map((t) => t._component)).toEqual(["GST"]);
  });

  it("a fully tax-free bill has an empty TaxLine[] and null/zero TotalTax", () => {
    const free = { ...baseInvoice, gst: 0, pst: 0, total: 1000 };
    const { bill } = buildQboBill(free, [{ ...baseLine, taxFlag: false }], {
      maps,
      taxMode: "manual-detail",
    });
    expect(bill.TxnTaxDetail?.TaxLine).toEqual([]);
  });

  it("the GST TaxLine's NetAmountTaxable spans GST + GST_PST lines; PST spans only PST lines", () => {
    const matPst = { ...baseLine, amount: 800, taxFlag: true, lineNo: 0 }; // GST_PST
    const supGst = { ...baseLine2, amount: 200, taxFlag: false, lineNo: 1 }; // GST only
    const { bill } = buildQboBill(baseInvoice, [matPst, supGst], {
      maps,
      taxMode: "manual-detail",
    });
    const gstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "PST");
    expect(gstLine?.TaxLineDetail.NetAmountTaxable).toBe(1000); // 800 + 200
    expect(pstLine?.TaxLineDetail.NetAmountTaxable).toBe(800); // only the PST line
  });

  it("TaxRateRef is a real TaxRate id from taxRateByLocal — NEVER a TaxCode id", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps, taxMode: "manual-detail" });
    const gstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "PST");
    // Real TaxRate ids, not the TaxCode ids (qbo-tax-G / qbo-tax-P) in taxByLocal.
    expect(gstLine?.TaxLineDetail.TaxRateRef).toEqual({ value: "qbo-rate-G" });
    expect(pstLine?.TaxLineDetail.TaxRateRef).toEqual({ value: "qbo-rate-P" });
  });

  it("TaxRateRef is null (not a guessed label/TaxCode) when no TaxRate is mapped", () => {
    const noRateMaps = { ...maps, taxRateByLocal: {} };
    const { bill } = buildQboBill(baseInvoice, [baseLine], {
      maps: noRateMaps,
      taxMode: "manual-detail",
    });
    const gstLine = bill.TxnTaxDetail?.TaxLine.find((t) => t._component === "GST");
    expect(gstLine?.TaxLineDetail.TaxRateRef).toBeNull();
  });
});

// QBO-H3 (#186): the DEFAULT mode lets QBO's Automatic Sales Tax compute the tax
// from each line's TaxCodeRef — no manual TxnTaxDetail (which AST companies
// reject). This is the primary misbooking fix.
describe("buildQboBill (line-codes, default) — AST-safe, QBO computes the tax", () => {
  it("omits TxnTaxDetail entirely by default", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps });
    expect(bill.TxnTaxDetail).toBeUndefined();
  });

  it("still carries the per-line TaxCodeRef QBO needs to compute GST + PST", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "qbo-tax-GP" });
    expect(bill.GlobalTaxCalculation).toBe("TaxExcluded");
  });

  it("reconciliation still tracks the GST/PST split for our own audit", () => {
    const { reconciliation } = buildQboBill(baseInvoice, [baseLine, baseLine2], { maps });
    expect(reconciliation.gst).toBe(50);
    expect(reconciliation.pst).toBe(70);
    expect(reconciliation.balanced).toBe(true);
  });
});

describe("buildQboBill — PST allocation across lines", () => {
  it("allocates header PST across taxable lines, summing EXACTLY to header PST", () => {
    // Two equal taxable lines, header PST 70 → 35 + 35.
    const a = { ...baseLine, id: "a", lineNo: 0, amount: 500, taxFlag: true };
    const b = { ...baseLine2, id: "b", lineNo: 1, amount: 500, taxFlag: true };
    const { bill } = buildQboBill(baseInvoice, [a, b], { maps });
    const shares = bill.Line.map((l) => l._pstShare);
    expect(shares).toEqual([35, 35]);
    expect(shares[0] + shares[1]).toBeCloseTo(70, 2);
  });

  it("does not dump shop-stock PST onto a single line — allocation spans all taxable lines", () => {
    // 3 equal taxable lines, header PST 70 → 23.33 + 23.33 + 23.34 = 70.00.
    const mk = (n: number) => ({
      ...baseLine,
      id: `pst-${n}`,
      lineNo: n,
      amount: 100,
      taxFlag: true,
    });
    const { bill } = buildQboBill(baseInvoice, [mk(0), mk(1), mk(2)], { maps });
    const shares = bill.Line.map((l) => l._pstShare);
    expect(shares.reduce((s, x) => s + x, 0)).toBeCloseTo(70, 2);
    expect(shares).toEqual([23.33, 23.33, 23.34]);
  });

  it("a non-taxable line carries no PST share", () => {
    const { bill } = buildQboBill(baseInvoice, [{ ...baseLine, taxFlag: false }], { maps });
    expect(bill.Line[0]._pstShare).toBe(0);
  });
});

describe("buildQboBill — total reconciliation (money is never lost or created)", () => {
  it("reconciles Σ pre-tax lines + GST + PST against the stated total", () => {
    const a = { ...baseLine, lineNo: 0, amount: 800, taxFlag: true };
    const b = { ...baseLine2, lineNo: 1, amount: 200, taxFlag: false };
    const { reconciliation } = buildQboBill(baseInvoice, [a, b], { maps });
    expect(reconciliation.lineSubtotal).toBe(1000);
    expect(reconciliation.gst).toBe(50);
    expect(reconciliation.pst).toBe(70);
    expect(reconciliation.computedTotal).toBe(1120);
    expect(reconciliation.statedTotal).toBe(1120);
    expect(reconciliation.balanced).toBe(true);
  });

  it("flags an unbalanced bill (lines + tax don't equal the stated total)", () => {
    const wrong = { ...baseInvoice, total: 9999 };
    const { reconciliation } = buildQboBill(wrong, [baseLine, baseLine2], { maps });
    expect(reconciliation.balanced).toBe(false);
  });

  it("a mixed material+subtrade+shop-stock bill still reconciles", () => {
    const material = {
      ...baseLine,
      id: "m",
      lineNo: 0,
      amount: 600,
      taxFlag: true,
      jobId: "job-1",
      lineKind: "material" as const,
    };
    const subtrade = {
      ...baseLine2,
      id: "s",
      lineNo: 1,
      amount: 200,
      taxFlag: true,
      jobId: "job-1",
      qboAccount: "5100-Subcontractors",
      lineKind: "subtrade" as const,
    };
    const shopStock = {
      ...baseLine,
      id: "ss",
      lineNo: 2,
      amount: 200,
      taxFlag: false,
      jobId: null,
    };
    const { bill, reconciliation } = buildQboBill(baseInvoice, [material, subtrade, shopStock], {
      maps,
    });
    expect(bill.Line).toHaveLength(3);
    expect(reconciliation.computedTotal).toBe(1120);
    expect(reconciliation.balanced).toBe(true);
  });
});
