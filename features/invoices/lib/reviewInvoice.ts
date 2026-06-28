/**
 * Pure business logic for the Slice 3 review screen.
 * No Supabase, no React — fully testable in isolation.
 *
 * Confidence model: per-line (the DB stores one number per line, not per cell).
 * Math model: two checks — lines sum ≈ preTaxTotal; preTaxTotal+gst+pst ≈ total.
 * Taxes are NEVER collapsed (CLAUDE.md + feature spec invariant).
 */

import { formatCAD } from "@shared/lib/format";

/** Lines with confidence below this get amber highlighting. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** Max tolerated difference between computed and stated totals (rounding). */
export const MATH_TOLERANCE = 0.05;

/**
 * Returns true when a line's confidence is below the threshold.
 * Null confidence (no extraction data) is NOT flagged — absence isn't failure.
 */
export function isLowConfidence(confidence: number | null): boolean {
  if (confidence === null) return false;
  return confidence < CONFIDENCE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Math validation
// ---------------------------------------------------------------------------

export type MathErrorKind =
  /** Σ(line amounts) doesn't match the stated pre-tax total. */
  | "lines_vs_pretax"
  /** preTaxTotal + gst + pst doesn't match the stated grand total. */
  | "pretax_plus_tax_vs_total";

export type MathError = {
  kind: MathErrorKind;
  /** The value the math says this should be. */
  expected: number;
  /** The value that was actually computed. */
  actual: number;
};

type HeaderForMath = {
  preTaxTotal: number | null;
  gst: number | null;
  pst: number | null;
  total: number | null;
};

type LineForMath = {
  amount: number | null;
};

/**
 * Validate invoice math against the two canonical checks (feature spec § math
 * validation). Returns an empty array when everything is within tolerance.
 *
 * Both checks are skipped when the relevant header field is null (the extractor
 * may not have found it yet; that's the confidence issue, not a math issue).
 */
export function validateMath(header: HeaderForMath, lines: LineForMath[]): MathError[] {
  const errors: MathError[] = [];

  const linesSum = lines.reduce<number>((acc, l) => acc + (l.amount ?? 0), 0);

  // Check 1: Σ lines ≈ preTaxTotal
  if (header.preTaxTotal !== null) {
    if (Math.abs(linesSum - header.preTaxTotal) > MATH_TOLERANCE) {
      errors.push({
        kind: "lines_vs_pretax",
        expected: header.preTaxTotal,
        actual: linesSum,
      });
    }
  }

  // Check 2: preTaxTotal + gst + pst ≈ total
  if (header.preTaxTotal !== null && header.total !== null) {
    const computedTotal = header.preTaxTotal + (header.gst ?? 0) + (header.pst ?? 0);
    if (Math.abs(computedTotal - header.total) > MATH_TOLERANCE) {
      errors.push({
        kind: "pretax_plus_tax_vs_total",
        expected: header.total,
        actual: computedTotal,
      });
    }
  }

  return errors;
}

/**
 * Plain-English description of a single math error, shared by the review screen
 * (where it's editable) and the match/post screen (read-only guard). Extracted
 * here so both surfaces phrase the mismatch identically.
 */
export function describeMathError(err: MathError): string {
  const diff = (a: number, b: number) => formatCAD(Math.abs(a - b));
  switch (err.kind) {
    case "lines_vs_pretax":
      return `Lines sum to ${formatCAD(err.actual)} but pre-tax total is ${formatCAD(err.expected)} (difference: ${diff(err.expected, err.actual)})`;
    case "pretax_plus_tax_vs_total":
      return `Pre-tax + GST + PST = ${formatCAD(err.actual)} but stated total is ${formatCAD(err.expected)} (difference: ${diff(err.expected, err.actual)})`;
  }
}
