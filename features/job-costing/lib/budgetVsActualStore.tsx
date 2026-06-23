"use client";

// Per-job loader hook for the Budget-vs-Actual tab (P4, ADR 0014).
// Fetches all four data sources concurrently, feeds the pure mappers from
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
  subtradeBudgetTotal,
  type BudgetLine,
  type LabourActual,
} from "@features/job-costing/lib/budgetVsActual";

// ── Types ─────────────────────────────────────────────────────────────────────

type BvaData = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsActual: number;
  subtradeBudget: number;
};

const EMPTY_DATA: BvaData = {
  labourBudget: [],
  labourActuals: [],
  materialsActual: 0,
  subtradeBudget: 0,
};

type LogActualInput = {
  amount: number;
  phaseId: MilestoneStage | null;
  note: string;
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

      // Fetch all four sources concurrently.
      const [ops, budgets, sessions, actuals, trades] = await Promise.all([
        sb.from("labour_operations").select("id, code, name"),
        sb.from("job_cost_budgets").select("*").eq("job_id", jobId).eq("kind", "labour"),
        sb.from("labour_sessions").select("*").eq("job_id", jobId),
        sb.from("job_cost_actuals").select("*").eq("job_id", jobId).eq("kind", "material"),
        sb.from("job_trades").select("*").eq("job_id", jobId),
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

      setData({
        labourBudget: rowsToLabourBudget(
          (budgets.data ?? []) as Record<string, unknown>[],
          codeName
        ),
        labourActuals: sessionsToLabourActuals((sessions.data ?? []) as Record<string, unknown>[]),
        materialsActual: materialActualTotal((actuals.data ?? []) as Record<string, unknown>[]),
        subtradeBudget: subtradeBudgetTotal((trades.data ?? []) as Record<string, unknown>[]),
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
        const { error: insertErr } = await getSupabase()
          .from("job_cost_actuals")
          .insert({
            job_id: jobId,
            kind: "material" as const,
            phase_id: a.phaseId,
            amount: a.amount,
            note: a.note,
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
