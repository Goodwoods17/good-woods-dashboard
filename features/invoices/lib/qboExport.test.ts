/**
 * Unit tests for Slice 8 QBO export logic — written first (TDD, red→green).
 * Pure functions: no Supabase, no React, no QBO API calls.
 */
import { describe, it, expect } from "vitest";
import { buildQboBill, lineTaxKey, resolveQboTaxMode } from "./qboExport";
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

// ===========================================================================
// QBO S6 (#152) — buildQboBill: the REAL QBO v3 Bill payload
// ===========================================================================
// buildQboBill emits the QBO v3 Bill request body: VendorRef, Line[] with
// AccountBasedExpenseLineDetail (the slice-8 flat `buildQboExport` stub was
// removed in QBO-H11 — it hardcoded "TAX"/"NON" and drifted from this builder)
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
  // QBO TaxRate ids (issue #186) — DISTINCT from the TaxCode ids above. Feed a
  // manual TxnTaxDetail TaxLine's TaxRateRef; a TaxCode id must never appear there.
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

describe("buildQboBill — TxnTaxDetail keeps GST and PST as two lines (manual mode)", () => {
  it("emits two TaxLines (GST + PST), never a single collapsed total", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps });
    expect(bill.TxnTaxDetail!.TotalTax).toBe(120);
    const components = bill.TxnTaxDetail!.TaxLine.map((t) => t._component).sort();
    expect(components).toEqual(["GST", "PST"]);
    const gstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "PST");
    expect(gstLine?.Amount).toBe(50);
    expect(pstLine?.Amount).toBe(70);
  });

  it("omits a zero/absent tax component (a GST-only bill has no PST TaxLine)", () => {
    const gstOnly = { ...baseInvoice, pst: 0, total: 1050 };
    const { bill } = buildQboBill(gstOnly, [baseLine2], { maps });
    expect(bill.TxnTaxDetail!.TaxLine.map((t) => t._component)).toEqual(["GST"]);
  });

  it("a fully tax-free bill has an empty TaxLine[] and null/zero TotalTax", () => {
    const free = { ...baseInvoice, gst: 0, pst: 0, total: 1000 };
    const { bill } = buildQboBill(free, [{ ...baseLine, taxFlag: false }], { maps });
    expect(bill.TxnTaxDetail!.TaxLine).toEqual([]);
  });

  it("the GST TaxLine's NetAmountTaxable spans GST + GST_PST lines; PST spans only PST lines", () => {
    const matPst = { ...baseLine, amount: 800, taxFlag: true, lineNo: 0 }; // GST_PST
    const supGst = { ...baseLine2, amount: 200, taxFlag: false, lineNo: 1 }; // GST only
    const { bill } = buildQboBill(baseInvoice, [matPst, supGst], { maps });
    const gstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "PST");
    expect(gstLine?.TaxLineDetail.NetAmountTaxable).toBe(1000); // 800 + 200
    expect(pstLine?.TaxLineDetail.NetAmountTaxable).toBe(800); // only the PST line
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

  // QBO-H11: a clean one-cent rounding gap must reconcile (`<=` 0.01), not be
  // false-flagged as a mismatch that blocks an otherwise-correct bill.
  it("reconciles a one-cent (0.01) rounding gap as balanced", () => {
    const a = { ...baseLine, lineNo: 0, amount: 800, taxFlag: true };
    const b = { ...baseLine2, lineNo: 1, amount: 200, taxFlag: false };
    // computed = 1000 + 50 + 70 = 1120; stated 1120.01 → gap of exactly 0.01.
    const penny = { ...baseInvoice, total: 1120.01 };
    const { reconciliation } = buildQboBill(penny, [a, b], { maps });
    expect(reconciliation.computedTotal).toBe(1120);
    expect(reconciliation.balanced).toBe(true);
  });

  it("still flags a two-cent (0.02) gap as unbalanced", () => {
    const a = { ...baseLine, lineNo: 0, amount: 800, taxFlag: true };
    const b = { ...baseLine2, lineNo: 1, amount: 200, taxFlag: false };
    const off = { ...baseInvoice, total: 1120.02 };
    const { reconciliation } = buildQboBill(off, [a, b], { maps });
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

// ───────────────────────────────────────────────────────────────────────────
// QBO-H3 (#186) — tax correctness: explicit exempt class + TaxRateRef/TaxCode +
// automatic vs manual tax mode.
// ───────────────────────────────────────────────────────────────────────────

// --- lineTaxKey: the EXPLICIT class API (models exempt vs GST-only) ----------
describe("lineTaxKey — explicit LineTaxClass distinguishes exempt from GST-only (#186)", () => {
  it("an EXPLICIT exempt line is non-taxable even on a GST+PST bill (the fix)", () => {
    // The old behaviour keyed any non-PST line to GST whenever the bill had GST,
    // sweeping a genuinely-exempt line into the GST NetAmountTaxable base.
    expect(lineTaxKey("exempt", { gst: 50, pst: 70 })).toBeNull();
  });

  it("an explicit gst_only line keys GST (not GST_PST) on a GST+PST bill", () => {
    expect(lineTaxKey("gst_only", { gst: 50, pst: 70 })).toBe("GST");
  });

  it("an explicit gst_pst line keys GST_PST on a GST+PST bill", () => {
    expect(lineTaxKey("gst_pst", { gst: 50, pst: 70 })).toBe("GST_PST");
  });

  it("an explicit gst_pst line on a PST-only bill keys PST (never invents GST)", () => {
    expect(lineTaxKey("gst_pst", { gst: 0, pst: 70 })).toBe("PST");
  });

  it("any explicit class on a tax-free bill is non-taxable", () => {
    expect(lineTaxKey("gst_pst", { gst: 0, pst: 0 })).toBeNull();
    expect(lineTaxKey("gst_only", { gst: 0, pst: 0 })).toBeNull();
    expect(lineTaxKey("exempt", { gst: 0, pst: 0 })).toBeNull();
  });

  it("legacy boolean flags still map identically (no regression)", () => {
    expect(lineTaxKey(true, { gst: 50, pst: 70 })).toBe(
      lineTaxKey("gst_pst", { gst: 50, pst: 70 })
    );
    expect(lineTaxKey(false, { gst: 50, pst: 70 })).toBe(
      lineTaxKey("gst_only", { gst: 50, pst: 70 })
    );
    expect(lineTaxKey(null, { gst: 50, pst: 70 })).toBe(lineTaxKey("exempt", { gst: 50, pst: 70 }));
  });
});

// --- TaxRateRef must be a TaxRate id, never a TaxCode id ----------------------
describe("buildQboBill — TaxRateRef sources a TaxRate id, not a TaxCode id (#186)", () => {
  it("manual mode populates TaxRateRef from taxRateByLocal (not taxByLocal)", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps, taxMode: "manual" });
    const gstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "GST");
    const pstLine = bill.TxnTaxDetail!.TaxLine.find((t) => t._component === "PST");
    // The TaxRate id — distinct from the TaxCode id "qbo-tax-G"/"qbo-tax-P".
    expect(gstLine!.TaxLineDetail.TaxRateRef).toEqual({ value: "qbo-rate-G" });
    expect(pstLine!.TaxLineDetail.TaxRateRef).toEqual({ value: "qbo-rate-P" });
    // It must NOT leak a TaxCode id into TaxRateRef.
    expect(gstLine!.TaxLineDetail.TaxRateRef!.value).not.toBe("qbo-tax-G");
  });

  it("TaxRateRef is NULL (never a label / TaxCode id) when no TaxRate is mapped", () => {
    const taxCodeOnly: MappingLookups = { accountByLocal: {}, taxByLocal: maps.taxByLocal };
    const { bill } = buildQboBill(baseInvoice, [baseLine], {
      maps: taxCodeOnly,
      taxMode: "manual",
    });
    for (const t of bill.TxnTaxDetail!.TaxLine) {
      expect(t.TaxLineDetail.TaxRateRef).toBeNull();
    }
  });

  it("the line TaxCodeRef still resolves from taxByLocal (TaxCode ids) — unchanged", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps, taxMode: "manual" });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "qbo-tax-GP" });
  });
});

// --- automatic (AST) mode: drop the manual TxnTaxDetail ----------------------
describe("buildQboBill — automatic (AST) tax mode omits the manual TxnTaxDetail (#186)", () => {
  it("omits TxnTaxDetail entirely so QBO computes tax from per-line TaxCodeRef", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps, taxMode: "automatic" });
    expect(bill.TxnTaxDetail).toBeUndefined();
  });

  it("still carries the correct per-line TaxCodeRef (drives QBO's computation)", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine, baseLine2], {
      maps,
      taxMode: "automatic",
    });
    expect(bill.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "qbo-tax-GP" });
    expect(bill.Line[1].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "qbo-tax-G" });
  });

  it("keeps the GST/PST split auditable via reconciliation (never collapsed)", () => {
    const matPst = { ...baseLine, amount: 800, taxFlag: true, lineNo: 0 }; // GST_PST
    const supGst = { ...baseLine2, amount: 200, taxFlag: false, lineNo: 1 }; // GST only
    const { reconciliation } = buildQboBill(baseInvoice, [matPst, supGst], {
      maps,
      taxMode: "automatic",
    });
    expect(reconciliation.gst).toBe(50);
    expect(reconciliation.pst).toBe(70);
    expect(reconciliation.gstBase).toBe(1000); // 800 + 200
    expect(reconciliation.pstBase).toBe(800); // only the PST line
    expect(reconciliation.balanced).toBe(true);
  });

  it("manual mode (the default) still emits the two TaxLines", () => {
    const { bill } = buildQboBill(baseInvoice, [baseLine], { maps });
    expect(bill.TxnTaxDetail).toBeDefined();
    expect(bill.TxnTaxDetail!.TaxLine.map((t) => t._component).sort()).toEqual(["GST", "PST"]);
  });
});

// --- reconciliation now surfaces the per-component taxable bases --------------
describe("buildQboBill — reconciliation exposes gstBase + pstBase (#186)", () => {
  it("reports the GST base across GST + GST_PST lines and PST base across PST lines", () => {
    const matPst = { ...baseLine, amount: 800, taxFlag: true, lineNo: 0 };
    const supGst = { ...baseLine2, amount: 200, taxFlag: false, lineNo: 1 };
    const { reconciliation } = buildQboBill(baseInvoice, [matPst, supGst], { maps });
    expect(reconciliation.gstBase).toBe(1000);
    expect(reconciliation.pstBase).toBe(800);
  });
});

// --- resolveQboTaxMode: env-driven, defaults to manual -----------------------
describe("resolveQboTaxMode — env flag, defaults to manual (#186)", () => {
  it("defaults to manual when QBO_TAX_MODE is unset", () => {
    expect(resolveQboTaxMode({})).toBe("manual");
  });
  it("returns automatic only for the exact 'automatic' value", () => {
    expect(resolveQboTaxMode({ QBO_TAX_MODE: "automatic" })).toBe("automatic");
    expect(resolveQboTaxMode({ QBO_TAX_MODE: "manual" })).toBe("manual");
    expect(resolveQboTaxMode({ QBO_TAX_MODE: "AUTOMATIC" })).toBe("manual");
  });
});
