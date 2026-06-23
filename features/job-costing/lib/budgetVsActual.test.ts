import { describe, it, expect } from "vitest";
import type { BvaInput, BvaResult } from "./budgetVsActual";
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
} from "./budgetVsActual";

// ── phaseComplete ─────────────────────────────────────────────────────────────

describe("phaseComplete", () => {
  it("cnc is complete when current=assembly", () => {
    expect(phaseComplete("cnc", "assembly", false)).toBe(true);
  });

  it("assembly is NOT complete when current=cnc", () => {
    expect(phaseComplete("assembly", "cnc", false)).toBe(false);
  });

  it("cnc is NOT complete when current=cnc (in-progress)", () => {
    expect(phaseComplete("cnc", "cnc", false)).toBe(false);
  });

  it("all phases complete when pipelineComplete", () => {
    expect(phaseComplete("design", "design", true)).toBe(true);
    expect(phaseComplete("install", "install", true)).toBe(true);
  });
});

// ── labourActualAmount ────────────────────────────────────────────────────────

describe("labourActualAmount", () => {
  it("labourActualAmount(50, 90) → 75", () => {
    expect(labourActualAmount(50, 90)).toBe(75);
  });

  it("labourActualAmount(60, 60) → 60", () => {
    expect(labourActualAmount(60, 60)).toBe(60);
  });

  it("labourActualAmount(100, 0) → 0", () => {
    expect(labourActualAmount(100, 0)).toBe(0);
  });
});

// ── projectedPhaseCost ────────────────────────────────────────────────────────

describe("projectedPhaseCost", () => {
  it("complete → actual (80)", () => {
    expect(projectedPhaseCost(true, 80, 100)).toBe(80);
  });

  it("open flat, actual < budget → budget (100)", () => {
    expect(projectedPhaseCost(false, 40, 100)).toBe(100);
  });

  it("open flat, actual > budget → actual (130)", () => {
    expect(projectedPhaseCost(false, 130, 100)).toBe(130);
  });

  it("open driven → actual + remaining*costPerUnit = 200", () => {
    // budgetedQty=40, doneQty=18, costPerUnit=5 → remaining=22 → 90 + 22*5 = 200
    expect(
      projectedPhaseCost(false, 90, 100, { budgetedQty: 40, doneQty: 18, costPerUnit: 5 })
    ).toBe(200);
  });
});

// ── marginTone ────────────────────────────────────────────────────────────────

describe("marginTone", () => {
  it("clawback 0 → on_track", () => {
    expect(marginTone(0, 10000)).toBe("on_track");
  });

  it("clawback negative → on_track", () => {
    expect(marginTone(-100, 10000)).toBe("on_track");
  });

  it("clawback 500 of 10000 (5%) → at_risk", () => {
    expect(marginTone(500, 10000)).toBe("at_risk");
  });

  it("clawback 2000 of 10000 (20%, >10%) → blocked", () => {
    expect(marginTone(2000, 10000)).toBe("blocked");
  });

  it("clawback 1000 of 10000 (10% boundary) → at_risk", () => {
    // exactly 10% is NOT > 10%, so at_risk
    expect(marginTone(1000, 10000)).toBe("at_risk");
  });

  it("clawback 1001 of 10000 (>10%) → blocked", () => {
    expect(marginTone(1001, 10000)).toBe("blocked");
  });
});

// ── variancePct (tested via computeBudgetVsActual results) ───────────────────

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

describe("variancePct null when budget is zero", () => {
  it("variancePct null when a code's budget is 0 (actual 25, budget 0)", () => {
    const result: BvaResult = computeBudgetVsActual(zeroBudgetInput);
    const phase = result.phases.find((p) => p.phaseId === "design");
    expect(phase).toBeTruthy();
    const code = phase!.codes.find((c) => c.codeId === "FREE");
    expect(code).toBeTruthy();
    expect(code!.budget).toBe(0);
    expect(code!.actual).toBe(25);
    expect(code!.variancePct).toBe(null);
    // phase-level variancePct also null (phase budget 0)
    expect(phase!.variancePct).toBe(null);
  });
});

// ── computeBudgetVsActual: under-budget fixture ───────────────────────────────
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

describe("computeBudgetVsActual under-budget fixture", () => {
  it("design phase projected = 80 (complete→actual)", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    const design = result.phases.find((p) => p.phaseId === "design");
    expect(design).toBeTruthy();
    expect(design!.projected).toBe(80);
    expect(design!.complete).toBe(true);
  });

  it("cnc phase projected = 200 (open→max(0,200))", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    const cnc = result.phases.find((p) => p.phaseId === "cnc");
    expect(cnc).toBeTruthy();
    expect(cnc!.projected).toBe(200);
    expect(cnc!.complete).toBe(false);
  });

  it("labourDrift = -20", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // projected=(80+200)=280, budget=(100+200)=300 → drift=-20
    expect(result.labourDrift).toBe(-20);
  });

  it("materialDrift = 0", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // materialProjected = max(1500,2000) = 2000, budget=2000 → drift=0
    expect(result.materialDrift).toBe(0);
  });

  it("budgetedMargin = 10000", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    expect(result.budgetedMargin).toBe(10000);
  });

  it("projectedMargin = 10020", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // 10000 - (-20) - 0 = 10020
    expect(result.projectedMargin).toBe(10020);
  });

  it("clawback = 0", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // max(0, -20+0) = 0
    expect(result.clawback).toBe(0);
  });

  it("other.materials.variance = -500", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // actual 1500 - budget 2000 = -500
    expect(result.other.materials.variance).toBe(-500);
  });

  it("other.subtrades.budget = 800", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    expect(result.other.subtrades.budget).toBe(800);
  });

  it("other.overhead = 300", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    expect(result.other.overhead).toBe(300);
  });

  it("totalLabourBudget = 300", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    expect(result.totalLabourBudget).toBe(300);
  });

  it("totalLabourActual = 80", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    expect(result.totalLabourActual).toBe(80);
  });

  it("materials variancePct = -25", () => {
    const result: BvaResult = computeBudgetVsActual(underBudgetInput);
    // materials budget=2000, actual=1500, variance=-500, variancePct = round1(-500/2000*100) = -25
    expect(result.other.materials.variancePct).toBe(-25);
  });
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

describe("computeBudgetVsActual overrun fixture", () => {
  it("cnc projected = 260 (actual>budget)", () => {
    const result: BvaResult = computeBudgetVsActual(overrunInput);
    const cnc = result.phases.find((p) => p.phaseId === "cnc");
    expect(cnc).toBeTruthy();
    expect(cnc!.projected).toBe(260);
  });

  it("labourDrift = +60", () => {
    const result: BvaResult = computeBudgetVsActual(overrunInput);
    // projected=(80+260)=340, budget=300 → drift=+60
    expect(result.labourDrift).toBe(60);
  });

  it("projectedMargin = 9940", () => {
    const result: BvaResult = computeBudgetVsActual(overrunInput);
    // 10000 - 60 - 0 = 9940
    expect(result.projectedMargin).toBe(9940);
  });

  it("clawback = 60", () => {
    const result: BvaResult = computeBudgetVsActual(overrunInput);
    // max(0, 60+0) = 60
    expect(result.clawback).toBe(60);
  });

  it("overhead+subtrade absent from clawback", () => {
    // overhead=300, subtrade=800 — these do NOT affect clawback
    const result: BvaResult = computeBudgetVsActual(overrunInput);
    // clawback should still be 60, not 60+300+800
    expect(result.clawback).toBe(60);
  });
});

// ── row mappers ───────────────────────────────────────────────────────────────

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

describe("row mappers", () => {
  it("rowsToLabourBudget: maps one budget row correctly", () => {
    const lines = rowsToLabourBudget(budgetRows, resolver);
    expect(lines.length).toBe(1);
    const l = lines[0]!;
    expect(l.phaseId).toBe("design");
    expect(l.codeId).toBe("u1");
    expect(l.codeName).toBe("Unassembly");
    expect(l.budgetedMinutes).toBe(120);
    expect(l.budgetedQuantity).toBe(null);
    expect(l.rate).toBe(50);
    expect(l.budgetedAmount).toBe(100);
  });

  it("rowsToLabourBudget: falls back to code_id string when resolver returns undefined", () => {
    const lines = rowsToLabourBudget(budgetRows, () => undefined);
    expect(lines[0]!.codeName).toBe("u1");
  });

  it("sessionsToLabourActuals: skips session with ended_at null; sums 90 min", () => {
    const actuals = sessionsToLabourActuals(sessionRows);
    expect(actuals.length).toBe(1);
    const a = actuals[0]!;
    expect(a.phaseId).toBe("design");
    expect(a.codeId).toBe("u1");
    expect(a.minutes).toBe(90);
    expect(a.quantity).toBe(null);
  });

  it("materialActualTotal: sums only material rows → 1500", () => {
    expect(materialActualTotal(actualRows)).toBe(1500);
  });

  it("subtradeBudgetTotal: sums all cost fields → 800", () => {
    expect(subtradeBudgetTotal(tradeRows)).toBe(800);
  });

  // End-to-end: feed mapped data into computeBudgetVsActual → labour actual-$ = 75
  // (90 min @ rate 50 → 75; but budget rate=50 is on the BudgetLine, and the
  //  synthetic rate in the actual slot comes from the BudgetLine matched by codeId)
  it("computeBudgetVsActual via mapped data: labour actual-$ for design/u1 = 75", () => {
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
    expect(design).toBeTruthy();
    const code = design!.codes.find((c) => c.codeId === "u1");
    expect(code).toBeTruthy();
    // 90 min / 60 * rate 50 = 75
    expect(code!.actual).toBe(75);
  });
});
