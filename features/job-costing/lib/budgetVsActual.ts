// Pure data layer for the Budget-vs-Actual tab (P4, ADR 0014).
// Margin is ANCHORED to the quoted margin + tracked drift — not recomputed.
// No React. No Set/Map spread.

import type { MilestoneStage } from "@shared/lib/types";
import { PHASE_ORDER, PHASE_LABELS } from "@features/job-costing/lib/costCodes";

export type BudgetLine = {
  phaseId: MilestoneStage;
  codeId: string | null;
  codeName: string;
  budgetedMinutes: number;
  budgetedQuantity: number | null;
  rate: number;
  budgetedAmount: number;
};

export type LabourActual = {
  phaseId: MilestoneStage;
  codeId: string | null;
  minutes: number;
  quantity: number | null;
};

export type BvaInput = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsBudget: number;
  materialsActual: number;
  subtradeBudget: number;
  overhead: number;
  quotedMargin: number;
  currentMilestone: MilestoneStage;
  pipelineComplete: boolean;
};

export type CodeRow = {
  codeId: string | null;
  codeName: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
};

export type PhaseRollup = {
  phaseId: MilestoneStage;
  label: string;
  complete: boolean;
  budget: number;
  actual: number;
  projected: number;
  variance: number;
  variancePct: number | null;
  codes: CodeRow[];
};

export type OtherCosts = {
  materials: { budget: number; actual: number; variance: number; variancePct: number | null };
  subtrades: { budget: number };
  overhead: number;
};

export type BvaResult = {
  phases: PhaseRollup[];
  other: OtherCosts;
  labourDrift: number;
  materialDrift: number;
  budgetedMargin: number;
  projectedMargin: number;
  clawback: number;
  totalLabourBudget: number;
  totalLabourActual: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function variancePct(variance: number, budget: number): number | null {
  if (budget === 0) return null;
  return round1((variance / budget) * 100);
}

// ── Row→input mappers ────────────────────────────────────────────────────────

// Maps raw `job_cost_budgets` rows (labour kind) to BudgetLine[].
// codeName resolver comes from the labour_operations registry (Task 3 wires it).
export function rowsToLabourBudget(
  rows: Record<string, unknown>[],
  codeName: (codeId: string) => string | undefined
): BudgetLine[] {
  return rows.map((r) => {
    const codeId = r.code_id != null ? String(r.code_id) : null;
    const resolvedName = (codeId != null && codeName(codeId)) || String(r.code_id ?? "—");
    return {
      phaseId: String(r.phase_id) as MilestoneStage,
      codeId,
      codeName: resolvedName,
      budgetedMinutes: Number(r.budgeted_minutes ?? 0),
      budgetedQuantity: r.budgeted_quantity == null ? null : Number(r.budgeted_quantity),
      rate: Number(r.rate ?? 0),
      budgetedAmount: Number(r.budgeted_amount ?? 0),
    };
  });
}

// Maps raw `labour_sessions` rows to LabourActual[].
// Skips sessions with ended_at == null (still running).
// Groups by category_id (phase) + operation_id (code); minutes = Σ accumulated_ms/60000.
// quantity = sum of non-null quantity values, or null if none present.
export function sessionsToLabourActuals(rows: Record<string, unknown>[]): LabourActual[] {
  const map = new Map<
    string,
    { phaseId: MilestoneStage; codeId: string | null; minutes: number; quantity: number | null }
  >();

  for (const r of rows) {
    if (r.ended_at == null) continue;
    const phaseId = String(r.category_id) as MilestoneStage;
    const codeId = r.operation_id != null ? String(r.operation_id) : null;
    const key = `${phaseId}|${codeId ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { phaseId, codeId, minutes: 0, quantity: null });
    }
    const slot = map.get(key)!;
    slot.minutes += Number(r.accumulated_ms ?? 0) / 60000;
    if (r.quantity != null) {
      slot.quantity = (slot.quantity ?? 0) + Number(r.quantity);
    }
  }

  return Array.from(map.values());
}

// Sums `amount` for all rows where kind === "material". Ignores other kinds.
export function materialActualTotal(rows: Record<string, unknown>[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind === "material") {
      total += Number(r.amount ?? 0);
    }
  }
  return total;
}

// Sums `cost` for all job_trades rows (subtrade budget).
export function subtradeBudgetTotal(rows: Record<string, unknown>[]): number {
  let total = 0;
  for (const r of rows) {
    total += Number(r.cost ?? 0);
  }
  return total;
}

// ── Exported functions ────────────────────────────────────────────────────────

// Current phase is in-progress, NOT complete.
export function phaseComplete(
  phase: MilestoneStage,
  currentMilestone: MilestoneStage,
  pipelineComplete: boolean
): boolean {
  if (pipelineComplete) return true;
  return PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(currentMilestone);
}

// minutes/60 * rate
export function labourActualAmount(rate: number, minutes: number): number {
  return (minutes / 60) * rate;
}

// complete → actual; open flat → max(actual, budget);
// open driven → actual + max(0, budgetedQty - doneQty) * costPerUnit
export function projectedPhaseCost(
  complete: boolean,
  actual: number,
  budget: number,
  drivenOpen?: { budgetedQty: number; doneQty: number; costPerUnit: number }
): number {
  if (complete) return actual;
  if (drivenOpen) {
    const remaining = Math.max(0, drivenOpen.budgetedQty - drivenOpen.doneQty);
    return actual + remaining * drivenOpen.costPerUnit;
  }
  return Math.max(actual, budget);
}

export function marginTone(
  clawback: number,
  budgetedMargin: number
): "on_track" | "at_risk" | "blocked" {
  if (clawback <= 0) return "on_track";
  if (budgetedMargin <= 0) return "blocked";
  if (clawback > budgetedMargin * 0.1) return "blocked";
  return "at_risk";
}

export function computeBudgetVsActual(input: BvaInput): BvaResult {
  const {
    labourBudget,
    labourActuals,
    materialsBudget,
    materialsActual,
    subtradeBudget,
    overhead,
    quotedMargin,
    currentMilestone,
    pipelineComplete,
  } = input;

  // Build a map: phaseId → codeKey → { budgetLine, totalMinutes, totalQty }
  // Use a stable composite key for grouping: `${phaseId}||${codeId ?? ""}`
  type CodeAccum = {
    budget: BudgetLine;
    actualMinutes: number;
    actualQty: number | null;
  };
  type PhaseAccum = Map<string, CodeAccum>;

  // Phase map preserves insertion order of PHASE_ORDER
  const phaseMap = new Map<MilestoneStage, PhaseAccum>();

  // Seed phases from budget lines
  for (const line of labourBudget) {
    if (!phaseMap.has(line.phaseId)) {
      phaseMap.set(line.phaseId, new Map());
    }
    const codeKey = `${line.codeId ?? ""}`;
    const phaseAccum = phaseMap.get(line.phaseId)!;
    if (!phaseAccum.has(codeKey)) {
      phaseAccum.set(codeKey, { budget: line, actualMinutes: 0, actualQty: null });
    }
  }

  // Accumulate actuals into phase/code slots
  for (const actual of labourActuals) {
    if (!phaseMap.has(actual.phaseId)) {
      phaseMap.set(actual.phaseId, new Map());
    }
    const codeKey = `${actual.codeId ?? ""}`;
    const phaseAccum = phaseMap.get(actual.phaseId)!;
    if (!phaseAccum.has(codeKey)) {
      // Actual for a code with no budget line — create a synthetic slot
      const synthetic: BudgetLine = {
        phaseId: actual.phaseId,
        codeId: actual.codeId,
        codeName: actual.codeId ?? "Unknown",
        budgetedMinutes: 0,
        budgetedQuantity: null,
        rate: 0,
        budgetedAmount: 0,
      };
      phaseAccum.set(codeKey, { budget: synthetic, actualMinutes: 0, actualQty: null });
    }
    const slot = phaseAccum.get(codeKey)!;
    slot.actualMinutes += actual.minutes;
    if (actual.quantity != null) {
      slot.actualQty = (slot.actualQty ?? 0) + actual.quantity;
    }
  }

  // Build PhaseRollup array in PHASE_ORDER
  const phases: PhaseRollup[] = [];
  let totalLabourBudget = 0;
  let totalLabourActual = 0;
  let totalLabourProjected = 0;

  for (const phaseId of PHASE_ORDER as MilestoneStage[]) {
    const phaseAccum = phaseMap.get(phaseId);
    if (!phaseAccum) continue;

    const complete = phaseComplete(phaseId, currentMilestone, pipelineComplete);
    const label = PHASE_LABELS[phaseId];

    const codes: CodeRow[] = [];
    let phaseBudget = 0;
    let phaseActual = 0;
    let phaseProjected = 0;

    for (const slot of Array.from(phaseAccum.values())) {
      const { budget: bl, actualMinutes, actualQty } = slot;
      const codeBudget = bl.budgetedAmount;
      const codeActual = labourActualAmount(bl.rate, actualMinutes);

      // Determine projection for this code
      let codeProjected: number;
      if (bl.budgetedQuantity != null && actualQty != null && actualQty > 0) {
        // Driven open: costPerUnit from actuals so far
        const costPerUnit = codeActual / actualQty;
        codeProjected = projectedPhaseCost(complete, codeActual, codeBudget, {
          budgetedQty: bl.budgetedQuantity,
          doneQty: actualQty,
          costPerUnit,
        });
      } else if (bl.budgetedQuantity != null && (actualQty == null || actualQty === 0)) {
        // Driven but no actuals yet — fall back to flat
        codeProjected = projectedPhaseCost(complete, codeActual, codeBudget);
      } else {
        codeProjected = projectedPhaseCost(complete, codeActual, codeBudget);
      }

      const codeVariance = codeActual - codeBudget;
      const row: CodeRow = {
        codeId: bl.codeId,
        codeName: bl.codeName,
        budget: codeBudget,
        actual: codeActual,
        variance: codeVariance,
        variancePct: variancePct(codeVariance, codeBudget),
      };
      codes.push(row);

      phaseBudget += codeBudget;
      phaseActual += codeActual;
      phaseProjected += codeProjected;
    }

    const phaseVariance = phaseActual - phaseBudget;
    phases.push({
      phaseId,
      label,
      complete,
      budget: phaseBudget,
      actual: phaseActual,
      projected: phaseProjected,
      variance: phaseVariance,
      variancePct: variancePct(phaseVariance, phaseBudget),
      codes,
    });

    totalLabourBudget += phaseBudget;
    totalLabourActual += phaseActual;
    totalLabourProjected += phaseProjected;
  }

  // Margin math — anchored to quoted margin + drift
  const labourDrift = totalLabourProjected - totalLabourBudget;

  const materialProjected = pipelineComplete
    ? materialsActual
    : Math.max(materialsActual, materialsBudget);
  const materialDrift = materialProjected - materialsBudget;

  const budgetedMargin = quotedMargin;
  const projectedMargin = budgetedMargin - labourDrift - materialDrift;
  const clawback = Math.max(0, labourDrift + materialDrift);

  const matVariance = materialsActual - materialsBudget;
  const other: OtherCosts = {
    materials: {
      budget: materialsBudget,
      actual: materialsActual,
      variance: matVariance,
      variancePct: variancePct(matVariance, materialsBudget),
    },
    subtrades: { budget: subtradeBudget },
    overhead,
  };

  return {
    phases,
    other,
    labourDrift,
    materialDrift,
    budgetedMargin,
    projectedMargin,
    clawback,
    totalLabourBudget,
    totalLabourActual,
  };
}
