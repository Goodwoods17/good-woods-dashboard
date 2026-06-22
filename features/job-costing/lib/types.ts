// Cost Codes & Live Job Costing — shared types (P1).
// Spec: docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md
//
// A cost code is a labour Operation (see @features/labour) that carries a short
// `code` and an optional `driver`. The types here cover the new costing entities:
// templates, the per-project estimate/invoice records, and the budget/actual
// ledgers. Stores + UI that read them land in P2+.

// ─── Driver ───────────────────────────────────────────────────────────────
// The unit a cost code's time scales with. Reuses the estimator's units plus
// sheet/board. A code with no driver is flat (time-only).

export type DriverUnit = "ea" | "sqft" | "lf" | "bf" | "sheet" | "board";

export const DRIVER_UNITS: DriverUnit[] = ["ea", "sqft", "lf", "bf", "sheet", "board"];

export const DRIVER_UNIT_LABELS: Record<DriverUnit, string> = {
  ea: "each",
  sqft: "sq ft",
  lf: "lin ft",
  bf: "board ft",
  sheet: "sheet",
  board: "board",
};

// ─── Templates — the estimating bundles ─────────────────────────────────────

export type CostCodeTemplate = {
  id: string;
  name: string;
  active: boolean;
};

export type CostCodeTemplateItem = {
  id: string;
  templateId: string;
  codeId: string | null;
  budgetedMinutes: number | null; // defaults to the code's historical average at load
  qty: number;
  sort: number;
};

// ─── Estimate / Invoice — light QuickBooks-mappable records (ADR 0010) ──────
// A project accrues many of each over its life (original + change orders).

export type JobEstimate = {
  id: string;
  jobId: string;
  label: string; // "Original", "Change order 1"
  estimateDate: string | null;
  total: number;
};

export type JobInvoice = {
  id: string;
  jobId: string;
  number: string;
  issuedDate: string | null;
  dueDate: string | null;
  amount: number;
};

// ─── Budget — the frozen baseline ───────────────────────────────────────────
// Per cost code for labour; per phase for material (codeId null). Subtrade
// budgets are NOT modelled here — they're read live from job_trades.cost.

export type CostKind = "labour" | "material";

export type JobCostBudget = {
  id: string;
  jobId: string;
  estimateId: string | null;
  codeId: string | null; // null for a phase-level material row
  phaseId: string | null;
  kind: CostKind;
  budgetedQuantity: number | null; // driven codes
  budgetedMinutes: number | null; // labour
  rate: number | null; // labour, snapshot
  budgetedAmount: number;
  sort: number;
};

// ─── Actual — incurred material/subtrade cost ───────────────────────────────
// Labour actuals come from labour_sessions, not here.

export type ActualKind = "material" | "subtrade" | "labour_adj";

export type JobCostActual = {
  id: string;
  jobId: string;
  kind: ActualKind;
  amount: number;
  partnerId: string | null; // soft ref: a Supplier (material) or Subtrade (subtrade)
  tradeLineId: string | null; // the job_trades line a subtrade actual fulfills
  codeId: string | null;
  phaseId: string | null;
  actualDate: string | null;
  note: string | null;
};
