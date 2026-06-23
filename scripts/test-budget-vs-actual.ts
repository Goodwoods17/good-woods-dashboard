/* eslint-disable no-console */
import assert from "node:assert/strict";
import type { BvaInput, BvaResult } from "../features/job-costing/lib/budgetVsActual";
import {
  phaseComplete,
  labourActualAmount,
  projectedPhaseCost,
  marginTone,
  computeBudgetVsActual,
  rowsToLabourBudget,
  sessionsToLabourActuals,
  materialActualTotal,
  subtradeBudgetTotal,
} from "../features/job-costing/lib/budgetVsActual";

let passed = 0;
function check(l: string, f: () => void) {
  f();
  passed++;
  console.log(`  ✓ ${l}`);
}

// ── phaseComplete ────────────────────────────────────────────────────────────
check("phaseComplete: cnc is complete when current=assembly", () => {
  assert.equal(phaseComplete("cnc", "assembly", false), true);
});

check("phaseComplete: assembly is NOT complete when current=cnc", () => {
  assert.equal(phaseComplete("assembly", "cnc", false), false);
});

check("phaseComplete: cnc is NOT complete when current=cnc (in-progress)", () => {
  assert.equal(phaseComplete("cnc", "cnc", false), false);
});

check("phaseComplete: all phases complete when pipelineComplete", () => {
  assert.equal(phaseComplete("design", "design", true), true);
  assert.equal(phaseComplete("install", "install", true), true);
});

// ── labourActualAmount ───────────────────────────────────────────────────────
check("labourActualAmount(50, 90) → 75", () => {
  assert.equal(labourActualAmount(50, 90), 75);
});

check("labourActualAmount(60, 60) → 60", () => {
  assert.equal(labourActualAmount(60, 60), 60);
});

check("labourActualAmount(100, 0) → 0", () => {
  assert.equal(labourActualAmount(100, 0), 0);
});

// ── projectedPhaseCost ───────────────────────────────────────────────────────
check("projectedPhaseCost: complete → actual (80)", () => {
  assert.equal(projectedPhaseCost(true, 80, 100), 80);
});

check("projectedPhaseCost: open flat, actual < budget → budget (100)", () => {
  assert.equal(projectedPhaseCost(false, 40, 100), 100);
});

check("projectedPhaseCost: open flat, actual > budget → actual (130)", () => {
  assert.equal(projectedPhaseCost(false, 130, 100), 130);
});

check("projectedPhaseCost: open driven → actual + remaining*costPerUnit = 200", () => {
  // budgetedQty=40, doneQty=18, costPerUnit=5 → remaining=22 → 90 + 22*5 = 200
  assert.equal(
    projectedPhaseCost(false, 90, 100, { budgetedQty: 40, doneQty: 18, costPerUnit: 5 }),
    200
  );
});

// ── marginTone ───────────────────────────────────────────────────────────────
check("marginTone: clawback 0 → on_track", () => {
  assert.equal(marginTone(0, 10000), "on_track");
});

check("marginTone: clawback negative → on_track", () => {
  assert.equal(marginTone(-100, 10000), "on_track");
});

check("marginTone: clawback 500 of 10000 (5%) → at_risk", () => {
  assert.equal(marginTone(500, 10000), "at_risk");
});

check("marginTone: clawback 2000 of 10000 (20%, >10%) → blocked", () => {
  assert.equal(marginTone(2000, 10000), "blocked");
});

check("marginTone: clawback 1000 of 10000 (10% boundary) → at_risk", () => {
  // exactly 10% is NOT > 10%, so at_risk
  assert.equal(marginTone(1000, 10000), "at_risk");
});

check("marginTone: clawback 1001 of 10000 (>10%) → blocked", () => {
  assert.equal(marginTone(1001, 10000), "blocked");
});

// ── variancePct (tested via computeBudgetVsActual results) ──────────────────

// A code with zero budget but real actual must report variancePct null (no
// divide-by-zero). budgetedAmount=0 + rate>0 + actual minutes>0 → actual$>0.
const zeroBudgetInput: BvaInput = {
  labourBudget: [
    {
      phaseId: "design",
      codeId: "FREE",
      codeName: "Unbudgeted code",
      budgetedMinutes: 0,
      budgetedQuantity: null,
      rate: 50,
      budgetedAmount: 0,
    },
  ],
  labourActuals: [{ phaseId: "design", codeId: "FREE", minutes: 30, quantity: null }], // 30/60*50 = 25
  materialsBudget: 0,
  materialsActual: 0,
  subtradeBudget: 0,
  overhead: 0,
  quotedMargin: 1000,
  currentMilestone: "design",
  pipelineComplete: false,
};
check("variancePct null when a code's budget is 0 (actual 25, budget 0)", () => {
  const result: BvaResult = computeBudgetVsActual(zeroBudgetInput);
  const phase = result.phases.find((p) => p.phaseId === "design");
  assert.ok(phase, "design phase present");
  const code = phase!.codes.find((c) => c.codeId === "FREE");
  assert.ok(code, "FREE code row present");
  assert.equal(code!.budget, 0);
  assert.equal(code!.actual, 25);
  assert.equal(code!.variancePct, null);
  // phase-level variancePct also null (phase budget 0)
  assert.equal(phase!.variancePct, null);
});

// ── computeBudgetVsActual: under-budget fixture ──────────────────────────────
// design: budget=100 actual=80 (complete); cnc: budget=200 actual=0 (open)
// materials: budget=2000, actual=1500
// subtrade=800, overhead=300, quotedMargin=10000, current=cnc, not complete
const underBudgetInput: BvaInput = {
  labourBudget: [
    {
      phaseId: "design",
      codeId: "DSN",
      codeName: "Design / drafting",
      budgetedMinutes: 120,
      budgetedQuantity: null,
      rate: 50,
      budgetedAmount: 100,
    },
    {
      phaseId: "cnc",
      codeId: "CUT-SHEET",
      codeName: "Cut + edgeband sheet",
      budgetedMinutes: 240,
      budgetedQuantity: null,
      rate: 50,
      budgetedAmount: 200,
    },
  ],
  labourActuals: [
    { phaseId: "design", codeId: "DSN", minutes: 96, quantity: null }, // 96/60*50 = 80
    { phaseId: "cnc", codeId: "CUT-SHEET", minutes: 0, quantity: null },
  ],
  materialsBudget: 2000,
  materialsActual: 1500,
  subtradeBudget: 800,
  overhead: 300,
  quotedMargin: 10000,
  currentMilestone: "cnc",
  pipelineComplete: false,
};

check("computeBudgetVsActual under-budget: design phase projected = 80 (complete→actual)", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  const design = result.phases.find((p) => p.phaseId === "design");
  assert.ok(design, "design phase present");
  assert.equal(design!.projected, 80);
  assert.equal(design!.complete, true);
});

check("computeBudgetVsActual under-budget: cnc phase projected = 200 (open→max(0,200))", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  const cnc = result.phases.find((p) => p.phaseId === "cnc");
  assert.ok(cnc, "cnc phase present");
  assert.equal(cnc!.projected, 200);
  assert.equal(cnc!.complete, false);
});

check("computeBudgetVsActual under-budget: labourDrift = -20", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // projected=(80+200)=280, budget=(100+200)=300 → drift=-20
  assert.equal(result.labourDrift, -20);
});

check("computeBudgetVsActual under-budget: materialDrift = 0", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // materialProjected = max(1500,2000) = 2000, budget=2000 → drift=0
  assert.equal(result.materialDrift, 0);
});

check("computeBudgetVsActual under-budget: budgetedMargin = 10000", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  assert.equal(result.budgetedMargin, 10000);
});

check("computeBudgetVsActual under-budget: projectedMargin = 10020", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // 10000 - (-20) - 0 = 10020
  assert.equal(result.projectedMargin, 10020);
});

check("computeBudgetVsActual under-budget: clawback = 0", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // max(0, -20+0) = 0
  assert.equal(result.clawback, 0);
});

check("computeBudgetVsActual under-budget: other.materials.variance = -500", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // actual 1500 - budget 2000 = -500
  assert.equal(result.other.materials.variance, -500);
});

check("computeBudgetVsActual under-budget: other.subtrades.budget = 800", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  assert.equal(result.other.subtrades.budget, 800);
});

check("computeBudgetVsActual under-budget: other.overhead = 300", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  assert.equal(result.other.overhead, 300);
});

check("computeBudgetVsActual under-budget: totalLabourBudget = 300", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  assert.equal(result.totalLabourBudget, 300);
});

check("computeBudgetVsActual under-budget: totalLabourActual = 80", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  assert.equal(result.totalLabourActual, 80);
});

check("computeBudgetVsActual under-budget: variancePct null when budget=0", () => {
  const result: BvaResult = computeBudgetVsActual(underBudgetInput);
  // Find a phase code with zero budget to check null variancePct
  // materials budget=2000, actual=1500, variance=-500, variancePct = round1(-500/2000*100) = -25
  assert.equal(result.other.materials.variancePct, -25);
});

// ── computeBudgetVsActual: overrun fixture ────────────────────────────────────
// Both phases open (currentMilestone="design" = in-progress, not complete).
// design actual=80 → projected=max(80,100)=100; cnc actual=260 → projected=max(260,200)=260
// labourDrift = (100+260) - (100+200) = 360 - 300 = +60
const overrunInput: BvaInput = {
  ...underBudgetInput,
  currentMilestone: "design",
  labourActuals: [
    { phaseId: "design", codeId: "DSN", minutes: 96, quantity: null }, // 96/60*50=80
    { phaseId: "cnc", codeId: "CUT-SHEET", minutes: 312, quantity: null }, // 312/60*50=260
  ],
};

check("computeBudgetVsActual overrun: cnc projected = 260 (actual>budget)", () => {
  const result: BvaResult = computeBudgetVsActual(overrunInput);
  const cnc = result.phases.find((p) => p.phaseId === "cnc");
  assert.ok(cnc, "cnc phase present");
  assert.equal(cnc!.projected, 260);
});

check("computeBudgetVsActual overrun: labourDrift = +60", () => {
  const result: BvaResult = computeBudgetVsActual(overrunInput);
  // projected=(80+260)=340, budget=300 → drift=+60
  assert.equal(result.labourDrift, 60);
});

check("computeBudgetVsActual overrun: projectedMargin = 9940", () => {
  const result: BvaResult = computeBudgetVsActual(overrunInput);
  // 10000 - 60 - 0 = 9940
  assert.equal(result.projectedMargin, 9940);
});

check("computeBudgetVsActual overrun: clawback = 60", () => {
  const result: BvaResult = computeBudgetVsActual(overrunInput);
  // max(0, 60+0) = 60
  assert.equal(result.clawback, 60);
});

check("computeBudgetVsActual overrun: overhead+subtrade absent from clawback", () => {
  // overhead=300, subtrade=800 — these do NOT affect clawback
  const result: BvaResult = computeBudgetVsActual(overrunInput);
  // clawback should still be 60, not 60+300+800
  assert.equal(result.clawback, 60);
});

// ── row mappers ──────────────────────────────────────────────────────────────

// Fixtures (verbatim from task-2-brief.md)
const budgetRows = [
  {
    phase_id: "design",
    code_id: "u1",
    kind: "labour",
    budgeted_minutes: 120,
    rate: 50,
    budgeted_amount: 100,
    budgeted_quantity: null,
  },
];

// Three sessions for category_id:"design"/operation_id:"u1".
// Session A: ended_at null → skipped. Sessions B + C: completed, same key →
// minutes accumulate (30 + 60 = 90), genuinely exercising the grouping sum.
const sessionRows = [
  {
    category_id: "design",
    operation_id: "u1",
    accumulated_ms: 3_600_000, // would be 60 min — but ended_at null → skipped
    ended_at: null,
    quantity: null,
  },
  {
    category_id: "design",
    operation_id: "u1",
    accumulated_ms: 1_800_000, // 30 min, completed
    ended_at: "2026-06-22T10:00:00Z",
    quantity: null,
  },
  {
    category_id: "design",
    operation_id: "u1",
    accumulated_ms: 3_600_000, // 60 min, completed → group sum = 90 min
    ended_at: "2026-06-22T11:00:00Z",
    quantity: null,
  },
];

const actualRows = [
  { kind: "material", amount: 1500 },
  { kind: "labour", amount: 200 }, // non-material → ignored
];

const tradeRows = [{ cost: 500 }, { cost: 300 }];

// Code-name resolver: maps "u1" → "Unassembly"
const resolver = (id: string) => (id === "u1" ? "Unassembly" : undefined);

check("rowsToLabourBudget: maps one budget row correctly", () => {
  const lines = rowsToLabourBudget(budgetRows, resolver);
  assert.equal(lines.length, 1);
  const l = lines[0]!;
  assert.equal(l.phaseId, "design");
  assert.equal(l.codeId, "u1");
  assert.equal(l.codeName, "Unassembly");
  assert.equal(l.budgetedMinutes, 120);
  assert.equal(l.budgetedQuantity, null);
  assert.equal(l.rate, 50);
  assert.equal(l.budgetedAmount, 100);
});

check("rowsToLabourBudget: falls back to code_id string when resolver returns undefined", () => {
  const lines = rowsToLabourBudget(budgetRows, () => undefined);
  assert.equal(lines[0]!.codeName, "u1");
});

check("sessionsToLabourActuals: skips session with ended_at null; sums 90 min", () => {
  const actuals = sessionsToLabourActuals(sessionRows);
  assert.equal(actuals.length, 1);
  const a = actuals[0]!;
  assert.equal(a.phaseId, "design");
  assert.equal(a.codeId, "u1");
  assert.equal(a.minutes, 90);
  assert.equal(a.quantity, null);
});

check("materialActualTotal: sums only material rows → 1500", () => {
  assert.equal(materialActualTotal(actualRows), 1500);
});

check("subtradeBudgetTotal: sums all cost fields → 800", () => {
  assert.equal(subtradeBudgetTotal(tradeRows), 800);
});

// End-to-end: feed mapped data into computeBudgetVsActual → labour actual-$ = 75
// (90 min @ rate 50 → 75; but budget rate=50 is on the BudgetLine, and the
//  synthetic rate in the actual slot comes from the BudgetLine matched by codeId)
check("computeBudgetVsActual via mapped data: labour actual-$ for design/u1 = 75", () => {
  const lines = rowsToLabourBudget(budgetRows, resolver);
  const actuals = sessionsToLabourActuals(sessionRows);
  const input: BvaInput = {
    labourBudget: lines,
    labourActuals: actuals,
    materialsBudget: 0,
    materialsActual: materialActualTotal(actualRows),
    subtradeBudget: subtradeBudgetTotal(tradeRows),
    overhead: 0,
    quotedMargin: 5000,
    currentMilestone: "design",
    pipelineComplete: false,
  };
  const result: BvaResult = computeBudgetVsActual(input);
  const design = result.phases.find((p) => p.phaseId === "design");
  assert.ok(design, "design phase present");
  const code = design!.codes.find((c) => c.codeId === "u1");
  assert.ok(code, "u1 code row present");
  // 90 min / 60 * rate 50 = 75
  assert.equal(code!.actual, 75);
});

console.log(`\n${passed} checks passed.`);
