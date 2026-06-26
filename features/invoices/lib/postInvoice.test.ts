/**
 * Unit tests for Slice 5 posting logic — written first (TDD).
 * Pure functions: no Supabase, no React.
 *
 * Money invariant (ADR 0019): pre-tax `amount` is the headline actual; the PST
 * allocated across taxable lines must sum EXACTLY to the header PST — money is
 * never lost or created by rounding.
 */
import { describe, it, expect } from "vitest";
import { allocateLinePst, buildActualRows, canPostInvoice, postBlockedReason } from "./postInvoice";
import type { InvoiceStatus } from "./types";

// ---------------------------------------------------------------------------
// allocateLinePst
// ---------------------------------------------------------------------------

describe("allocateLinePst", () => {
  it("returns no shares when header PST is null or zero", () => {
    const lines = [{ id: "a", amount: 100, taxFlag: true }];
    expect(allocateLinePst(lines, null)).toEqual({});
    expect(allocateLinePst(lines, 0)).toEqual({});
  });

  it("puts the whole PST on the single taxable line", () => {
    const lines = [{ id: "a", amount: 100, taxFlag: true }];
    expect(allocateLinePst(lines, 7)).toEqual({ a: 7 });
  });

  it("excludes non-taxable and zero-amount lines from the allocation", () => {
    const lines = [
      { id: "a", amount: 100, taxFlag: true },
      { id: "b", amount: 50, taxFlag: false },
      { id: "c", amount: 0, taxFlag: true },
    ];
    expect(allocateLinePst(lines, 7)).toEqual({ a: 7 });
  });

  it("allocates proportionally to amount across taxable lines", () => {
    const lines = [
      { id: "a", amount: 75, taxFlag: true },
      { id: "b", amount: 25, taxFlag: true },
    ];
    // 10 PST on 100 taxable → 7.50 / 2.50
    expect(allocateLinePst(lines, 10)).toEqual({ a: 7.5, b: 2.5 });
  });

  it("pushes the rounding residual onto the last line so parts sum EXACTLY", () => {
    // 3 equal taxable lines, PST 10 → 3.33 + 3.33 + 3.34 = 10.00 exactly.
    const lines = [
      { id: "a", amount: 10, taxFlag: true },
      { id: "b", amount: 10, taxFlag: true },
      { id: "c", amount: 10, taxFlag: true },
    ];
    const shares = allocateLinePst(lines, 10);
    expect(shares).toEqual({ a: 3.33, b: 3.33, c: 3.34 });
    const sum = Object.values(shares).reduce((s, n) => s + n, 0);
    expect(sum).toBeCloseTo(10, 10);
  });
});

// ---------------------------------------------------------------------------
// buildActualRows
// ---------------------------------------------------------------------------

const INVOICE = { id: "inv-1", pst: 10 };

describe("buildActualRows", () => {
  it("skips shop-stock (null job) and null-amount lines", () => {
    const rows = buildActualRows(INVOICE, [
      { id: "a", amount: 100, taxFlag: true, jobId: "job-1" },
      { id: "b", amount: 50, taxFlag: true, jobId: null }, // shop stock
      { id: "c", amount: null, taxFlag: true, jobId: "job-1" }, // no amount
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceInvoiceLineId).toBe("a");
  });

  it("books pre-tax as the headline amount and adds PST for the with-tax figure", () => {
    const rows = buildActualRows(INVOICE, [
      { id: "a", amount: 100, taxFlag: true, jobId: "job-1" },
    ]);
    expect(rows[0]).toEqual({
      jobId: "job-1",
      kind: "material",
      amount: 100,
      amountWithTax: 110, // 100 + full PST 10
      sourceInvoiceId: "inv-1",
      sourceInvoiceLineId: "a",
    });
  });

  it("a non-taxable assigned line carries no PST (with-tax == pre-tax)", () => {
    const rows = buildActualRows(INVOICE, [
      { id: "a", amount: 100, taxFlag: false, jobId: "job-1" },
    ]);
    expect(rows[0].amount).toBe(100);
    expect(rows[0].amountWithTax).toBe(100);
  });

  it("splits PST across multiple assigned taxable lines, summing to header PST", () => {
    const rows = buildActualRows(INVOICE, [
      { id: "a", amount: 75, taxFlag: true, jobId: "job-1" },
      { id: "b", amount: 25, taxFlag: true, jobId: "job-2" },
    ]);
    const pstTotal = rows.reduce((s, r) => s + (r.amountWithTax - r.amount), 0);
    expect(pstTotal).toBeCloseTo(10, 10);
    expect(rows[0].jobId).toBe("job-1");
    expect(rows[1].jobId).toBe("job-2");
  });

  it("does not dump shop-stock PST onto the job line (allocation spans all taxable lines)", () => {
    // Two taxable lines of equal amount; only one is assigned to a job. The
    // assigned line should carry only its half of the PST, not the whole bill's.
    const rows = buildActualRows(INVOICE, [
      { id: "a", amount: 50, taxFlag: true, jobId: "job-1" },
      { id: "b", amount: 50, taxFlag: true, jobId: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountWithTax - rows[0].amount).toBeCloseTo(5, 10);
  });
});

// ---------------------------------------------------------------------------
// canPostInvoice / postBlockedReason — re-post guard
// ---------------------------------------------------------------------------

describe("canPostInvoice", () => {
  it("only a reviewed invoice can be posted", () => {
    expect(canPostInvoice({ status: "reviewed" })).toBe(true);
    const others: InvoiceStatus[] = ["pending", "needs_review", "posted", "error"];
    for (const status of others) {
      expect(canPostInvoice({ status })).toBe(false);
    }
  });
});

describe("postBlockedReason", () => {
  it("returns null for a reviewed invoice", () => {
    expect(postBlockedReason({ status: "reviewed" })).toBeNull();
  });

  it("blocks an already-posted invoice (no double-count)", () => {
    expect(postBlockedReason({ status: "posted" })).toMatch(/already been posted/i);
  });

  it("blocks an unreviewed invoice", () => {
    expect(postBlockedReason({ status: "needs_review" })).toMatch(/review/i);
    expect(postBlockedReason({ status: "pending" })).toMatch(/review/i);
  });

  it("blocks an errored invoice", () => {
    expect(postBlockedReason({ status: "error" })).toMatch(/error/i);
  });
});
