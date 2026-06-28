"use client";

/**
 * S2/S15 — Store seam for phase capacity (public.scheduling_phase_capacity).
 *
 * Owns the Supabase read for per-phase weekly capacity so FreeCapacityPanel,
 * PhaseCapacityPanel and EstimatorView all share one data-access path (via the
 * `usePhaseCapacity` hook) instead of inlining the query.
 */
import { getSupabase, hasSupabase, SCHEDULING_PHASE_CAPACITY_TABLE } from "@shared/lib/supabase";
import { DEFAULT_WEEKLY_CAPACITY_HOURS, type PhaseHours } from "./capacity";
import { applyPhaseCapacityRows, type PhaseCapacityRow } from "./phaseCapacityRowMap";

/**
 * Load per-phase weekly capacity, merged onto the defaults. Falls back to
 * DEFAULT_WEEKLY_CAPACITY_HOURS when offline, on error, or when the table is empty.
 */
export async function loadPhaseCapacity(): Promise<PhaseHours> {
  if (!hasSupabase()) return { ...DEFAULT_WEEKLY_CAPACITY_HOURS };
  const { data, error } = await getSupabase()
    .from(SCHEDULING_PHASE_CAPACITY_TABLE)
    .select("phase, weekly_capacity_hours");
  if (error || !data || data.length === 0) return { ...DEFAULT_WEEKLY_CAPACITY_HOURS };
  return applyPhaseCapacityRows(data as PhaseCapacityRow[]);
}
