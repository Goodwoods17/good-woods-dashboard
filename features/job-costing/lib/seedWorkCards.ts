// Seed shop-floor work cards from a frozen labour budget (Slice B Part 1). One
// 'todo' card per budgeted code, in its phase, with the budget's target quantity.
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import type { CostCodeBudget } from "./budget";

export function workCardRowsFromBudget(
  jobId: string,
  budget: CostCodeBudget,
  codeToId: Map<string, string>,
): Record<string, unknown>[] {
  return budget.rows
    .filter((r) => r.budgetedMinutes > 0 || r.amount > 0)
    .map((r, i) => ({
      job_id: jobId,
      phase_id: r.phaseId,
      operation_id: codeToId.get(r.code) ?? null,
      description: r.name,
      target_quantity: r.driver ? r.quantity : null,
      status: "todo",
      source: "budget",
      sort: i,
    }));
}

export async function seedWorkCardsFromBudget(
  jobId: string,
  budget: CostCodeBudget,
  codeToId: Map<string, string>,
): Promise<number> {
  if (!hasSupabase()) return 0;
  const rows = workCardRowsFromBudget(jobId, budget, codeToId);
  if (rows.length === 0) return 0;
  const { error } = await getSupabase().from("work_cards").insert(rows);
  if (error) throw error;
  return rows.length;
}
