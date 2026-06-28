"use client";

import { useEffect, useState } from "react";
import { DEFAULT_WEEKLY_CAPACITY_HOURS, type PhaseHours } from "./capacity";
import { loadPhaseCapacity } from "./phaseCapacityStore";

/**
 * Load per-phase weekly capacity from `scheduling_phase_capacity`.
 * Falls back to DEFAULT_WEEKLY_CAPACITY_HOURS when the table is empty or
 * unreachable. Used by FreeCapacityPanel + PhaseCapacityPanel (on /labour) and
 * EstimatorView (at quote time — S16) so every surface reflects the same
 * capacity config. The Supabase read lives in `phaseCapacityStore.ts`.
 */
export function usePhaseCapacity(): PhaseHours {
  const [capacity, setCapacity] = useState<PhaseHours>(DEFAULT_WEEKLY_CAPACITY_HOURS);
  useEffect(() => {
    let cancelled = false;
    void loadPhaseCapacity().then((next) => {
      if (!cancelled) setCapacity(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return capacity;
}
