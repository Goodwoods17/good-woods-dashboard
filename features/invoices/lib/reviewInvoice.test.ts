/**
 * Unit tests for Slice 3 review logic — written first (TDD).
 * Pure functions: no Supabase, no React.
 */
import { describe, it, expect } from "vitest";
import {
  isLowConfidence,
  validateMath,
  CONFIDENCE_THRESHOLD,
  MATH_TOLERANCE,
} from "./reviewInvoice";

// ---------------------------------------------------------------------------
// isLowConfidence
// ---------------------------------------------------------------------------

describe("isLowConfidence", () => {
  it("returns false for null confidence (absence of data is not a flag)", () => {
    expect(isLowConfidence(null)).toBe(false);
  });

  it("returns false at exactly the threshold", () => {
    expect(isLowConfidence(CONFIDENCE_THRESHOLD)).toBe(false);
  });

  it("returns false above the threshold", () => {
    expect(isLowConfidence(1.0)).toBe(false);
    expect(isLowConfidence(0.95)).toBe(false);
    expect(isLowConfidence(CONFIDENCE_THRESHOLD + 0.01)).toBe(false);
  });

  it("returns true below the threshold", () => {
    expect(isLowConfidence(CONFIDENCE_THRESHOLD - 0.01)).toBe(true);
    expect(isLowConfidence(0.5)).toBe(true);
    expect(isLowConfidence(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateMath — two checks:
//   1. Σ(line amounts) ≈ preTaxTotal
//   2. preTaxTotal + gst + pst ≈ total
// ---------------------------------------------------------------------------

describe("validateMath — clean invoice (no errors)", () => {
  const header = { preTaxTotal: 1000, gst: 50, pst: 70, total: 1120 };
  const lines = [{ amount: 800 }, { amount: 200 }];

  it("returns empty array when everything adds up", () => {
    expect(validateMath(header, lines)).toEqual([]);
  });

  it("is tolerant of sub-cent floating-point rounding", () => {
    // 800 + 199.99 = 999.99 — within MATH_TOLERANCE of 1000
    const fuzzyLines = [{ amount: 800 }, { amount: 199.99 }];
    expect(validateMath(header, fuzzyLines)).toEqual([]);
  });

  it("treats null line amounts as zero when summing", () => {
    const linesWithNull = [{ amount: 1000 }, { amount: null }];
    expect(validateMath(header, linesWithNull)).toEqual([]);
  });

  it("skips check 1 when preTaxTotal is null", () => {
    const nullPreTax = { ...header, preTaxTotal: null };
    expect(validateMath(nullPreTax, lines)).toEqual([]);
  });

  it("skips check 2 when total is null", () => {
    const nullTotal = { ...header, total: null };
    expect(validateMath(nullTotal, lines)).toEqual([]);
  });

  it("treats null gst and pst as zero for check 2", () => {
    const noTax = { preTaxTotal: 1000, gst: null, pst: null, total: 1000 };
    expect(validateMath(noTax, lines)).toEqual([]);
  });
});

describe("validateMath — lines don't match pre-tax total", () => {
  const header = { preTaxTotal: 1000, gst: 50, pst: 70, total: 1120 };

  it("flags lines_vs_pretax when sum differs by more than tolerance", () => {
    // Sum = 950, stated preTaxTotal = 1000 → difference 50 > MATH_TOLERANCE
    const errors = validateMath(header, [{ amount: 800 }, { amount: 150 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("lines_vs_pretax");
    expect(errors[0].expected).toBe(1000);
    expect(errors[0].actual).toBeCloseTo(950, 5);
  });

  it("does NOT flag lines_vs_pretax when difference is exactly MATH_TOLERANCE", () => {
    const tinyDiff = [{ amount: 1000 - MATH_TOLERANCE }, { amount: 0 }];
    expect(validateMath(header, tinyDiff)).toHaveLength(0);
  });

  it("flags when lines sum exceeds preTaxTotal", () => {
    const errors = validateMath(header, [{ amount: 800 }, { amount: 300 }]);
    const linesErr = errors.find((e) => e.kind === "lines_vs_pretax");
    expect(linesErr).toBeDefined();
    expect(linesErr!.actual).toBeCloseTo(1100, 5);
  });
});

describe("validateMath — tax math doesn't match total", () => {
  it("flags pretax_plus_tax_vs_total when total is wrong", () => {
    // 1000 + 50 + 70 = 1120, but stated total is 1200
    const badHeader = { preTaxTotal: 1000, gst: 50, pst: 70, total: 1200 };
    const lines = [{ amount: 1000 }];
    const errors = validateMath(badHeader, lines);
    const taxErr = errors.find((e) => e.kind === "pretax_plus_tax_vs_total");
    expect(taxErr).toBeDefined();
    expect(taxErr!.expected).toBe(1200);
    expect(taxErr!.actual).toBeCloseTo(1120, 5);
  });

  it("can return both errors simultaneously", () => {
    const badAll = { preTaxTotal: 1000, gst: 50, pst: 70, total: 1200 };
    const badLines = [{ amount: 800 }]; // 800 ≠ 1000 AND 1120 ≠ 1200
    const errors = validateMath(badAll, badLines);
    const kinds = errors.map((e) => e.kind);
    expect(kinds).toContain("lines_vs_pretax");
    expect(kinds).toContain("pretax_plus_tax_vs_total");
  });
});

describe("validateMath — edge cases", () => {
  it("handles empty lines array (preTaxTotal must also be null or 0 to pass)", () => {
    const header = { preTaxTotal: 0, gst: 0, pst: 0, total: 0 };
    expect(validateMath(header, [])).toEqual([]);
  });

  it("flags when all nulls but total is non-null and preTaxTotal is non-null", () => {
    const header = { preTaxTotal: 100, gst: null, pst: null, total: 200 };
    const lines = [{ amount: 100 }];
    // 100 + 0 + 0 = 100 ≠ 200
    const errors = validateMath(header, lines);
    expect(errors.some((e) => e.kind === "pretax_plus_tax_vs_total")).toBe(true);
  });
});
