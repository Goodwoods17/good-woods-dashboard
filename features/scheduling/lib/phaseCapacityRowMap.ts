/**
 * S2/S15 — Row mapper for public.scheduling_phase_capacity.
 * One row per phase: the configured weekly capacity in hours. `numeric` columns
 * can arrive as strings over the wire, so the hours coerce to Number.
 */
import type { MilestoneStage } from "@shared/lib/types";
import { DEFAULT_WEEKLY_CAPACITY_HOURS, type PhaseHours } from "./capacity";

export type PhaseCapacityRow = {
  phase: string;
  weekly_capacity_hours: number | string;
};

/** Merge capacity rows onto the per-phase defaults (unknown phases ignored). */
export function applyPhaseCapacityRows(rows: PhaseCapacityRow[]): PhaseHours {
  const next: PhaseHours = { ...DEFAULT_WEEKLY_CAPACITY_HOURS };
  for (const row of rows) {
    if (row.phase in next) {
      next[row.phase as MilestoneStage] = Number(row.weekly_capacity_hours);
    }
  }
  return next;
}
