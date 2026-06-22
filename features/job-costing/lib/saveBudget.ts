// Freeze a job's labour cost-code budget at Save-as-Job (ADR 0012 Slice 1).
// Writes one job_estimates row ("Original" budgeting cycle) + one
// job_cost_budgets row per non-empty labour code. Material/subtrade budgets are
// NOT written here in Slice 1 (materials become explicit with the Mozaik BOM in
// Slice 2; subtrade budgets read live from job_trades per ADR 0007/0009).
//
// Non-fatal by contract: the caller runs this after the Job is created and
// treats a throw as a logged warning, so a costing hiccup never strands the
// user on a half-saved estimate. Returns null when Supabase isn't configured
// (localStorage mode) — the budget is a server-only concept.

import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import type { CostCodeBudget, CostCodeBudgetRow, RoomBudget } from "./budget";

export type SaveJobBudgetInput = {
  jobId: string;
  quotedTotal: number;
  budget: CostCodeBudget;
  // When present (a Mozaik per-room import), the budget is written split by room
  // (room_label set per line); Σ(perRoom) equals `budget`. Absent → one
  // job-level set (room_label null).
  perRoom?: RoomBudget[];
  estimateLabel?: string; // "Original" | "Change order 1"
  estimateDate?: string; // ISO yyyy-mm-dd; defaults to today
};

export type SaveJobBudgetResult = {
  estimateId: string;
  budgetRows: number;
};

export async function saveJobBudget(
  input: SaveJobBudgetInput,
): Promise<SaveJobBudgetResult | null> {
  if (!hasSupabase()) return null;
  const sb = getSupabase();

  // 1. The budgeting cycle.
  const { data: est, error: estErr } = await sb
    .from("job_estimates")
    .insert({
      job_id: input.jobId,
      label: input.estimateLabel ?? "Original",
      estimate_date: input.estimateDate ?? new Date().toISOString().slice(0, 10),
      total: round2(input.quotedTotal),
    })
    .select("id")
    .single();
  if (estErr) throw estErr;
  const estimateId = (est as { id: string }).id;

  // 2. Resolve code → labour_operations.id (the seeded canonical codes).
  const { data: ops, error: opsErr } = await sb
    .from("labour_operations")
    .select("id, code")
    .not("code", "is", null);
  if (opsErr) throw opsErr;
  const codeToId = new Map(
    (ops as { id: string; code: string }[]).map((o) => [o.code, o.id]),
  );

  // 3. One labour budget row per code that carries time/cost. Split by room
  // when a per-room breakdown is supplied, else a single job-level set.
  const sources: { roomLabel: string | null; rows: CostCodeBudgetRow[] }[] =
    input.perRoom && input.perRoom.length > 0
      ? input.perRoom.map((r) => ({ roomLabel: r.roomLabel, rows: r.budget.rows }))
      : [{ roomLabel: null, rows: input.budget.rows }];

  let sort = 0;
  const rows: Record<string, unknown>[] = [];
  for (const src of sources) {
    for (const r of src.rows) {
      if (!(r.budgetedMinutes > 0 || r.amount > 0)) continue;
      rows.push({
        job_id: input.jobId,
        estimate_id: estimateId,
        code_id: codeToId.get(r.code) ?? null,
        phase_id: r.phaseId,
        room_label: src.roomLabel,
        kind: "labour" as const,
        budgeted_quantity: r.driver ? r.quantity : null,
        budgeted_minutes: round2(r.budgetedMinutes),
        rate: r.rate,
        budgeted_amount: round2(r.amount),
        sort: sort++,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await sb.from("job_cost_budgets").insert(rows);
    if (error) throw error;
  }

  // Seed shop-floor work cards from the frozen budget (Slice B). Non-fatal.
  try {
    const { seedWorkCardsFromBudget } = await import("./seedWorkCards");
    await seedWorkCardsFromBudget(input.jobId, input.budget, codeToId);
  } catch (e) {
    console.warn("Failed to seed work cards:", e);
  }

  return { estimateId, budgetRows: rows.length };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
