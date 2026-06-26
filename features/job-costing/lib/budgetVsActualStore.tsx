"use client";

// Per-job loader hook for the Budget-vs-Actual tab (P4, ADR 0014).
// Fetches the five reads concurrently, feeds the pure mappers from
// budgetVsActual.ts, and exposes logActual for logging a material spend row.
// No Context / Provider — this is a hook, one per mounted tab.

import { useState, useCallback, useEffect } from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { MilestoneStage } from "@shared/lib/types";
import {
  rowsToLabourBudget,
  sessionsToLabourActuals,
  materialActualTotal,
  materialActuals,
  materialActualWithTaxTotal,
  subtradeActualsByLine,
  rowsToSubtradeLines,
  type BudgetLine,
  type LabourActual,
  type MaterialActual,
  type SubtradeLine,
} from "@features/job-costing/lib/budgetVsActual";

// ── Types ─────────────────────────────────────────────────────────────────────

type BvaData = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsActual: number;
  materialsActualWithTax: number;
  materialActuals: MaterialActual[];
  subtradeLines: SubtradeLine[];
};

const EMPTY_DATA: BvaData = {
  labourBudget: [],
  labourActuals: [],
  materialsActual: 0,
  materialsActualWithTax: 0,
  materialActuals: [],
  subtradeLines: [],
};

export type LogActualInput =
  | {
      kind: "material";
      phaseId: MilestoneStage | null;
      amount: number;
      date?: string;
      note?: string;
    }
  | {
      kind: "subtrade";
      tradeLineId: string;
      partnerId: string | null;
      amount: number;
      date?: string;
      note?: string;
    };

// ── Row shapes (internal) ─────────────────────────────────────────────────────

type OpsRow = { id: string; code: string | null; name: string | null };

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBudgetVsActual(jobId: string): {
  data: BvaData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logActual: (a: LogActualInput) => Promise<void>;
} {
  const [data, setData] = useState<BvaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabase()) {
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();

      // Fetch ops + the four data sources concurrently.
      const [ops, budgets, sessions, actuals, trades] = await Promise.all([
        sb.from("labour_operations").select("id, code, name"),
        sb.from("job_cost_budgets").select("*").eq("job_id", jobId).eq("kind", "labour"),
        sb.from("labour_sessions").select("*").eq("job_id", jobId),
        sb.from("job_cost_actuals").select("*").eq("job_id", jobId),
        sb.from("job_trades").select("*, trades(label), subtrades(name)").eq("job_id", jobId),
      ]);

      if (ops.error) throw ops.error;
      if (budgets.error) throw budgets.error;
      if (sessions.error) throw sessions.error;
      if (actuals.error) throw actuals.error;
      if (trades.error) throw trades.error;

      // Build id → name ?? code resolver from labour_operations.
      const opRows = (ops.data ?? []) as OpsRow[];
      const opMap = new Map<string, string>(opRows.map((o) => [o.id, o.name ?? o.code ?? o.id]));
      const codeName = (id: string): string | undefined => opMap.get(id);

      const tradeRows = (trades.data ?? []) as Record<string, unknown>[];
      const actualRows = (actuals.data ?? []) as Record<string, unknown>[];
      const tradeNameById = new Map<string, string>();
      const subNameById = new Map<string, string>();
      for (const r of tradeRows) {
        const t = r.trades as { label?: string } | null;
        const s = r.subtrades as { name?: string } | null;
        if (r.trade_id != null && t?.label) tradeNameById.set(String(r.trade_id), t.label);
        if (r.subtrade_id != null && s?.name) subNameById.set(String(r.subtrade_id), s.name);
      }
      const subtradeLines = rowsToSubtradeLines(
        tradeRows,
        subtradeActualsByLine(actualRows),
        (id) => tradeNameById.get(id),
        (id) => subNameById.get(id)
      );

      setData({
        labourBudget: rowsToLabourBudget(
          (budgets.data ?? []) as Record<string, unknown>[],
          codeName
        ),
        labourActuals: sessionsToLabourActuals((sessions.data ?? []) as Record<string, unknown>[]),
        materialsActual: materialActualTotal(actualRows),
        materialsActualWithTax: materialActualWithTaxTotal(actualRows),
        materialActuals: materialActuals(actualRows),
        subtradeLines,
      });
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Mount effect: run once when jobId changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logActual = useCallback(
    async (a: LogActualInput) => {
      if (!hasSupabase()) return;
      try {
        const base = { job_id: jobId, amount: a.amount, note: a.note, actual_date: a.date ?? null };
        const { error: insertErr } =
          a.kind === "material"
            ? await getSupabase()
                .from("job_cost_actuals")
                .insert({ ...base, kind: "material" as const, phase_id: a.phaseId })
            : await getSupabase()
                .from("job_cost_actuals")
                .insert({
                  ...base,
                  kind: "subtrade" as const,
                  trade_line_id: a.tradeLineId,
                  partner_id: a.partnerId,
                });
        if (insertErr) throw insertErr;
        await refresh();
      } catch (e) {
        setError(formatError(e));
      }
    },
    [jobId, refresh]
  );

  return { data, loading, error, refresh, logActual };
}
