// Derive a labour cost-code budget from a template's code set + the cabinet
// counts (ADR 0012 Slice 1). Pure: no Supabase, no React. Drives the estimator
// "Labour cost codes" panel and the frozen `job_cost_budgets` rows written at
// Save-as-Job.
//
// Quantity resolution per code:
//   • cabinetType set (ASM-/INST-*)  → the cabinet summary count for that type
//   • code === DEL-LOAD              → total cabinet count (loading is per box)
//   • driven but no cabinetType      → a manual qty override (sqft sheets etc.;
//                                       Mozaik fills these in Slice 2), else 0
//   • flat (driver null, e.g. DSN)   → manual minutes override, else default
//
// budgetedMinutes = driven ? qty × minPerUnit : minPerUnit (flat = total).
// amount = budgetedMinutes / 60 × phase rate.

import type { CabinetSummary, LabourRates } from "@features/estimator/lib/types";
import { totalCabinetCount } from "@features/estimator/lib/types";
import type { CabinetTypeId } from "@features/estimator/lib/types";
import {
  CANONICAL_COST_CODES,
  rateForPhase,
  TOTAL_CABINET_COUNT_CODES,
  type CostCodeDef,
  type CostCodeRegistry,
  type PhaseId,
} from "./costCodes";

export type CostCodeBudgetRow = {
  code: string;
  name: string;
  phaseId: PhaseId;
  driver: CostCodeDef["driver"];
  cabinetType?: CabinetTypeId;
  quantity: number; // resolved driver quantity (0 for flat codes)
  minutesPerUnit: number; // per-unit (driven) or total (flat) minutes used
  budgetedMinutes: number;
  rate: number; // $/hr snapshot
  amount: number; // budgeted $
};

export type CostCodeBudget = {
  rows: CostCodeBudgetRow[];
  totalMinutes: number;
  totalAmount: number; // total labour budget $
};

export type DeriveBudgetOptions = {
  // Per-code overrides. minutesByCode overrides the per-unit/flat minutes;
  // qtyByCode overrides the resolved quantity (used for non-cabinet drivers
  // like FIN-SPRAY sqft / CUT-SHEET sheets, and for any manual tweak).
  minutesByCode?: Record<string, number>;
  qtyByCode?: Record<string, number>;
};

function resolveQuantity(
  def: CostCodeDef,
  cabinets: CabinetSummary,
  override: number | undefined,
): number {
  if (override != null && override >= 0) return override;
  if (def.cabinetType) return nonNeg(cabinets[def.cabinetType]?.count ?? 0);
  if (TOTAL_CABINET_COUNT_CODES.has(def.code)) return totalCabinetCount(cabinets);
  return 0; // other driven codes (sqft/sheets) need a manual/import qty
}

export function deriveCostCodeBudget(
  codes: string[],
  cabinets: CabinetSummary,
  rates: LabourRates,
  registry: CostCodeRegistry,
  options: DeriveBudgetOptions = {},
): CostCodeBudget {
  const { minutesByCode = {}, qtyByCode = {} } = options;
  const rows: CostCodeBudgetRow[] = [];

  for (const code of codes) {
    const def = registry.get(code);
    if (!def) continue; // unknown / unphased code — skip rather than guess
    const minutesPerUnit = nonNeg(minutesByCode[code] ?? def.defaultMinutes);
    const quantity = resolveQuantity(def, cabinets, qtyByCode[code]);
    const budgetedMinutes = def.driver ? quantity * minutesPerUnit : minutesPerUnit;
    const rate = rateForPhase(def.phaseId, rates);
    const amount = (budgetedMinutes / 60) * rate;
    rows.push({
      code: def.code,
      name: def.name,
      phaseId: def.phaseId,
      driver: def.driver,
      cabinetType: def.cabinetType,
      quantity,
      minutesPerUnit,
      budgetedMinutes,
      rate,
      amount,
    });
  }

  const totalMinutes = rows.reduce((s, r) => s + r.budgetedMinutes, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, totalMinutes, totalAmount };
}

// Reconcile the coded labour budget against the quote's labour subtotal so a
// drift is visible before the budget freezes (spec §5). Both are labour cost
// (pre-markup). Returns the signed delta and a % of the quote labour.
export type BudgetReconciliation = {
  codedLabour: number;
  quoteLabour: number;
  delta: number; // coded − quote (positive = budget richer than quote)
  pctOfQuote: number; // |delta| / quoteLabour × 100 (0 when quote labour is 0)
  drifts: boolean; // |pct| ≥ 10 — worth a note
};

export function reconcileBudgetVsQuote(
  codedLabour: number,
  quoteLabour: number,
): BudgetReconciliation {
  const delta = round2(codedLabour - quoteLabour);
  const pctOfQuote = quoteLabour > 0 ? Math.abs(delta / quoteLabour) * 100 : 0;
  return {
    codedLabour: round2(codedLabour),
    quoteLabour: round2(quoteLabour),
    delta,
    pctOfQuote,
    drifts: pctOfQuote >= 10,
  };
}

// Per-room budgets (ADR 0012 Slice 2 follow-on). Derive a labour budget for each
// room from its own cabinet counts + cost-code quantities, so the frozen budget
// can be split by room. The job total is the sum (same codes/rates/minutes), so
// Σ(perRoom) reconciles to the job-level deriveCostCodeBudget.
export type RoomBudgetInput = {
  name: string;
  cabinets: CabinetSummary;
  qtyByCode?: Record<string, number>;
};

export type RoomBudget = { roomLabel: string; budget: CostCodeBudget };

export function derivePerRoomBudgets(
  rooms: RoomBudgetInput[],
  codes: string[],
  rates: LabourRates,
  registry: CostCodeRegistry,
  minutesByCode: Record<string, number> = {},
): RoomBudget[] {
  return rooms.map((room) => ({
    roomLabel: room.name,
    budget: deriveCostCodeBudget(codes, room.cabinets, rates, registry, {
      qtyByCode: room.qtyByCode ?? {},
      minutesByCode,
    }),
  }));
}

// The default code set for a job that uses every phase — used when a template
// doesn't pin its own set (back-compat) and as the "Full custom build" set.
export const FULL_BUILD_CODE_SET: string[] = CANONICAL_COST_CODES.map((c) => c.code);

function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
