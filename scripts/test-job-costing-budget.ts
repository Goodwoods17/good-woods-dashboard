/* eslint-disable no-console */
// Pure-logic test for the cost-code budget derivation (ADR 0012 Slice 1).
// Run: npx tsx scripts/test-job-costing-budget.ts

import assert from "node:assert/strict";
import {
  deriveCostCodeBudget,
  reconcileBudgetVsQuote,
  FULL_BUILD_CODE_SET,
} from "../features/job-costing/lib/budget";
import { emptyCabinetSummary, DEFAULT_LABOUR_RATES } from "../features/estimator/lib/types";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}
function near(a: number, b: number, eps = 0.01) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);
}

console.log("cost-code budget derivation");

// Kitchen-shaped counts (the Mozaik sample: 13 base / 3 wall / 6 tall).
const cabinets = emptyCabinetSummary();
cabinets.base = { count: 13, linearFt: 69.14 };
cabinets.wall = { count: 3, linearFt: 46.5 };
cabinets.tall = { count: 6, linearFt: 16.25 };

const budget = deriveCostCodeBudget(FULL_BUILD_CODE_SET, cabinets, DEFAULT_LABOUR_RATES);
const byCode = Object.fromEntries(budget.rows.map((r) => [r.code, r]));

check("ASM-BASE: 13 × 60min @ $85 = $1105", () => {
  assert.equal(byCode["ASM-BASE"].quantity, 13);
  assert.equal(byCode["ASM-BASE"].budgetedMinutes, 780);
  near(byCode["ASM-BASE"].amount, 1105);
});

check("INST-TALL: 6 × 45min @ $95 install rate = $427.50", () => {
  assert.equal(byCode["INST-TALL"].rate, 95);
  near(byCode["INST-TALL"].amount, 427.5);
});

check("DEL-LOAD: qty = total cabinet count (22)", () => {
  assert.equal(byCode["DEL-LOAD"].quantity, 22);
  near(byCode["DEL-LOAD"].budgetedMinutes, 110);
});

check("ASM-ISLAND with no island cabinets → 0", () => {
  assert.equal(byCode["ASM-ISLAND"].amount, 0);
});

check("FIN-SPRAY/CUT-SHEET default to 0 qty without an import/manual figure", () => {
  assert.equal(byCode["FIN-SPRAY"].quantity, 0);
  assert.equal(byCode["CUT-SHEET"].quantity, 0);
});

check("qtyByCode override drives non-cabinet codes (FIN-SPRAY 25.55 sqft)", () => {
  const b = deriveCostCodeBudget(["FIN-SPRAY"], cabinets, DEFAULT_LABOUR_RATES, {
    qtyByCode: { "FIN-SPRAY": 25.55 },
  });
  near(b.rows[0].budgetedMinutes, 51.1); // 25.55 × 2
  near(b.rows[0].amount, (51.1 / 60) * 85);
});

check("minutesByCode override changes the per-unit rate", () => {
  const b = deriveCostCodeBudget(["ASM-BASE"], cabinets, DEFAULT_LABOUR_RATES, {
    minutesByCode: { "ASM-BASE": 72 }, // learning loop sharpened it
  });
  assert.equal(b.rows[0].budgetedMinutes, 13 * 72);
});

check("flat code (DSN) contributes minutes directly, no driver qty", () => {
  const b = deriveCostCodeBudget(["DSN"], cabinets, DEFAULT_LABOUR_RATES, {
    minutesByCode: { DSN: 120 },
  });
  assert.equal(b.rows[0].quantity, 0);
  assert.equal(b.rows[0].budgetedMinutes, 120);
  near(b.rows[0].amount, (120 / 60) * 85);
});

check("unknown codes are skipped, not guessed", () => {
  const b = deriveCostCodeBudget(["NOPE-XYZ", "ASM-BASE"], cabinets, DEFAULT_LABOUR_RATES);
  assert.equal(b.rows.length, 1);
});

check("reconciliation flags ≥10% drift vs the quote labour", () => {
  const r = reconcileBudgetVsQuote(3357.08, 3000);
  near(r.delta, 357.08);
  assert.ok(r.drifts);
  const tight = reconcileBudgetVsQuote(3050, 3000);
  assert.equal(tight.drifts, false);
});

check("total labour budget sums the rows", () => {
  near(budget.totalAmount, 1105 + 191.25 + 765 + 155.8333 + 617.5 + 95 + 427.5, 0.05);
});

console.log(`\n${passed} checks passed.`);
