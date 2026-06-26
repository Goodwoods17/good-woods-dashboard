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

export const UNASSIGNED_LINE = "__unassigned__";

export type SubtradeLine = {
  lineId: string;
  tradeName: string;
  subtradeName: string | null; // null = TBD (no subtrade assigned)
  subtradeId: string | null; // job_trades.subtrade_id; used as partner_id when logging
  status: "needed" | "booked" | "done";
  budget: number; // job_trades.cost (0 if null)
  actual: number; // Σ kind='subtrade' actuals for this trade_line_id
  variance: number; // actual − budget
  variancePct: number | null;
};

export type BvaInput = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsBudget: number;
  materialsActual: number;
  subtradeLines: SubtradeLine[];
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
  subtrades: {
    budget: number;
    actual: number;
    variance: number;
    variancePct: number | null;
    lines: SubtradeLine[];
  };
  overhead: number;
};

export type BvaResult = {
  phases: PhaseRollup[];
  other: OtherCosts;
  labourDrift: number;
  materialDrift: number;
  subtradeDrift: number;
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

// A material actual carrying its provenance (the bill it was posted from).
// `amount` is the pre-tax headline; `amountWithTax` is the "with PST" figure
// (falls back to `amount` for manually logged actuals with no tax captured).
export type MaterialActual = {
  id: string;
  amount: number;
  amountWithTax: number;
  sourceInvoiceId: string | null;
  sourceInvoiceLineId: string | null;
  note: string | null;
};

// Maps kind='material' job_cost_actuals rows to MaterialActual[], preserving
// provenance (source_invoice_id / line) so the BvA UI can link an actual back to
// its originating bill (invoice slice 5, issue #50).
export function materialActuals(rows: Record<string, unknown>[]): MaterialActual[] {
  const out: MaterialActual[] = [];
  for (const r of rows) {
    if (r.kind !== "material") continue;
    const amount = Number(r.amount ?? 0);
    out.push({
      id: String(r.id),
      amount,
      amountWithTax: r.amount_with_tax == null ? amount : Number(r.amount_with_tax),
      sourceInvoiceId: r.source_invoice_id != null ? String(r.source_invoice_id) : null,
      sourceInvoiceLineId:
        r.source_invoice_line_id != null ? String(r.source_invoice_line_id) : null,
      note: r.note != null ? String(r.note) : null,
    });
  }
  return out;
}

// Σ of the "with PST" figure for kind='material' rows — shown alongside the
// pre-tax materials actual. Falls back to `amount` where no tax was captured.
export function materialActualWithTaxTotal(rows: Record<string, unknown>[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind !== "material") continue;
    const amount = Number(r.amount ?? 0);
    total += r.amount_with_tax == null ? amount : Number(r.amount_with_tax);
  }
  return total;
}

// Sums `amount` of kind='subtrade' actuals, grouped by trade_line_id.
// Rows with a null trade_line_id accumulate under UNASSIGNED_LINE so money is
// never silently dropped.
export function subtradeActualsByLine(rows: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind !== "subtrade") continue;
    const key = r.trade_line_id != null ? String(r.trade_line_id) : UNASSIGNED_LINE;
    out[key] = (out[key] ?? 0) + Number(r.amount ?? 0);
  }
  return out;
}

// Builds one SubtradeLine per job_trades row, plus an Unassigned line if any
// subtrade actual has a null trade_line_id. tradeName/subtradeName resolve from
// the registries (the store passes embedded names).
export function rowsToSubtradeLines(
  jobTrades: Record<string, unknown>[],
  actualsByLine: Record<string, number>,
  tradeName: (id: string) => string | undefined,
  subtradeName: (id: string) => string | undefined
): SubtradeLine[] {
  const lines: SubtradeLine[] = jobTrades.map((r) => {
    const lineId = String(r.id);
    const budget = Number(r.cost ?? 0);
    const actual = actualsByLine[lineId] ?? 0;
    const variance = actual - budget;
    const tradeId = r.trade_id != null ? String(r.trade_id) : "";
    const subId = r.subtrade_id != null ? String(r.subtrade_id) : null;
    const rawStatus = String(r.status ?? "needed");
    const status: SubtradeLine["status"] =
      rawStatus === "booked" || rawStatus === "done" ? rawStatus : "needed";
    return {
      lineId,
      tradeName: tradeName(tradeId) ?? "Trade",
      subtradeName: subId != null ? (subtradeName(subId) ?? null) : null,
      subtradeId: subId,
      status,
      budget,
      actual,
      variance,
      variancePct: variancePct(variance, budget),
    };
  });

  const unassigned = actualsByLine[UNASSIGNED_LINE] ?? 0;
  if (unassigned !== 0) {
    lines.push({
      lineId: UNASSIGNED_LINE,
      tradeName: "Unassigned",
      subtradeName: null,
      subtradeId: null,
      status: "needed",
      budget: 0,
      actual: unassigned,
      variance: unassigned,
      variancePct: variancePct(unassigned, 0),
    });
  }
  return lines;
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

// A trade-line projects like a phase: a 'done' line is locked to its actual;
// an open line projects to max(actual, budget) so an under-budget open line
// contributes zero drift (mirrors materials' open-job rule).
export function subtradeLineProjected(line: SubtradeLine, pipelineComplete: boolean): number {
  if (pipelineComplete || line.status === "done") return line.actual;
  return Math.max(line.actual, line.budget);
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
    subtradeLines,
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

  const subtradeBudget = subtradeLines.reduce((s, l) => s + l.budget, 0);
  const subtradeActual = subtradeLines.reduce((s, l) => s + l.actual, 0);
  const subtradeProjected = subtradeLines.reduce(
    (s, l) => s + subtradeLineProjected(l, pipelineComplete),
    0
  );
  const subtradeDrift = subtradeProjected - subtradeBudget;
  const subtradeVariance = subtradeActual - subtradeBudget;

  const budgetedMargin = quotedMargin;
  const projectedMargin = budgetedMargin - labourDrift - materialDrift - subtradeDrift;
  const clawback = Math.max(0, labourDrift + materialDrift + subtradeDrift);

  const matVariance = materialsActual - materialsBudget;
  const other: OtherCosts = {
    materials: {
      budget: materialsBudget,
      actual: materialsActual,
      variance: matVariance,
      variancePct: variancePct(matVariance, materialsBudget),
    },
    subtrades: {
      budget: subtradeBudget,
      actual: subtradeActual,
      variance: subtradeVariance,
      variancePct: variancePct(subtradeVariance, subtradeBudget),
      lines: subtradeLines,
    },
    overhead,
  };

  return {
    phases,
    other,
    labourDrift,
    materialDrift,
    subtradeDrift,
    budgetedMargin,
    projectedMargin,
    clawback,
    totalLabourBudget,
    totalLabourActual,
  };
}
