"use client";

import { useEffect, useState } from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import type { MilestoneStage } from "@shared/lib/types";
import { DEFAULT_WEEKLY_CAPACITY_HOURS, type PhaseHours } from "./capacity";

/**
 * Load per-phase weekly capacity from `scheduling_phase_capacity`.
 * Falls back to DEFAULT_WEEKLY_CAPACITY_HOURS when the table is empty or
 * unreachable. Used by PhaseCapacityPanel (on /labour) and EstimatorView
 * (at quote time — S16) so both surfaces reflect the same capacity config.
 */
export function usePhaseCapacity(): PhaseHours {
  const [capacity, setCapacity] = useState<PhaseHours>(DEFAULT_WEEKLY_CAPACITY_HOURS);
  useEffect(() => {
    if (!hasSupabase()) return;
    let cancelled = false;
    getSupabase()
      .from("scheduling_phase_capacity")
      .select("phase, weekly_capacity_hours")
      .then(({ data, error }) => {
        if (cancelled || error || !data || data.length === 0) return;
        const next: PhaseHours = { ...DEFAULT_WEEKLY_CAPACITY_HOURS };
        for (const row of data as { phase: string; weekly_capacity_hours: number | string }[]) {
          if (row.phase in next) {
            next[row.phase as MilestoneStage] = Number(row.weekly_capacity_hours);
          }
        }
        setCapacity(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return capacity;
}
