import { MILESTONE_STAGES, type MilestoneStage } from "@shared/lib/types";
import {
  buildCapacityModel,
  HOURS_PER_WORK_DAY,
  type CapacitySession,
  type PhaseCapacityRow,
  type PhaseHours,
} from "./capacity";

/**
 * S15 — Free-capacity finder (issue #103).
 *
 * Surfaces open windows in the shop's schedule from the capacity model's gaps.
 *
 * The "forward/backward combination" algorithm:
 *   Forward  — scan upcoming weeks (Mon–Sun spans) for windows where
 *              capacity > load in every phase work-center.
 *   Backward — the first window that passes the all-phases check confirms
 *              a new job can start there without busting any work-center;
 *              chaining the phases backward from a desired delivery date
 *              validates the fit.
 *   Combined — the intersection (earliest week where ALL phases have
 *              enough free hours) = the bookable start window.
 *
 * Pure + dependency-free. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED.
 * Non-goal this slice: per-job scheduling, cost, or UI persistence.
 */

const PHASES: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);

/** How many weeks ahead to scan by default. */
export const DEFAULT_LOOKAHEAD_WEEKS = 8;

/**
 * Minimum free hours per phase to qualify a week as "bookable" for that
 * phase. One full work-day: a shop can't meaningfully start a new phase
 * with less than a day of available capacity.
 */
export const MIN_BOOKABLE_HOURS = HOURS_PER_WORK_DAY; // 8h

/** Month abbreviations for the week label. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Helpers ────────────────────────────────────────────────────────────────

/** ISO `YYYY-MM-DD` of a UTC Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Monday (UTC) of the ISO-week that contains `dateStr`. If the date is
 * already Monday it is returned unchanged.
 *
 * UTC day numbers: 0 = Sun, 1 = Mon … 6 = Sat.
 * Distance-to-Monday: (day + 6) % 7  (0→6→Sun, 1→0→Mon, …, 6→5→Sat)
 */
export function weekMondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay(); // 0 = Sun
  const toMonday = (day + 6) % 7; // days to subtract to reach Monday
  d.setUTCDate(d.getUTCDate() - toMonday);
  return isoDate(d);
}

/**
 * Human-readable label for a week: "Week of Aug 4".
 * Input must be the Monday ISO date of the week.
 */
export function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  const month = MONTHS[d.getUTCMonth()];
  return `Week of ${month} ${d.getUTCDate()}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

/** One week's capacity gap data for the free-capacity finder. */
export type CapacityWindow = {
  /** ISO YYYY-MM-DD (Monday UTC). */
  weekStart: string;
  /** ISO YYYY-MM-DD (Friday UTC). */
  weekEnd: string;
  /** Human-readable label, e.g. "Week of Aug 4". */
  label: string;
  /** Free hours per phase: max(0, capacity − load). */
  freeHoursByPhase: PhaseHours;
  /**
   * True when ALL six phase work-centers have ≥ MIN_BOOKABLE_HOURS free.
   * This is the "forward gap": the shop can absorb new work in every phase
   * this week without breaching any work-center's capacity.
   */
  isBookable: boolean;
};

/**
 * The earliest bookable slot: the first week where a new job can start
 * across all work-centers simultaneously.
 */
export type BookableSlot = {
  weekStart: string;
  weekEnd: string;
  label: string;
  freeHoursByPhase: PhaseHours;
};

// ── Core functions ─────────────────────────────────────────────────────────

/**
 * Per-phase available hours (the "forward gap"): max(0, capacity − load)
 * for each phase work-center. Over-capacity phases contribute 0 (no room).
 */
export function phaseAvailableHours(rows: PhaseCapacityRow[]): PhaseHours {
  const out = {
    design: 0,
    cnc: 0,
    assembly: 0,
    finishing: 0,
    delivery: 0,
    install: 0,
  } as PhaseHours;
  for (const r of rows) {
    out[r.phase] = Math.max(0, r.capacityHours - r.loadHours);
  }
  return out;
}

/**
 * Build capacity windows for the current week and the next
 * `(lookAheadWeeks − 1)` weeks, starting from the Monday of `today`'s week.
 *
 * Each window:
 *   - Uses `buildCapacityModel` to derive load from completed sessions
 *     whose `startedAt` falls within [weekStart, weekEnd + 1 day).
 *   - Computes free hours = max(0, capacity − load) per phase.
 *   - Sets `isBookable = true` when all phases have ≥ MIN_BOOKABLE_HOURS free.
 *
 * Upcoming weeks have no logged sessions → load = 0 → 100% free by definition.
 * The only "real" data is in the window that contains today (current week).
 */
export function buildWeeklyWindows(
  sessions: CapacitySession[],
  capacityByPhase: PhaseHours,
  today: string,
  lookAheadWeeks: number = DEFAULT_LOOKAHEAD_WEEKS
): CapacityWindow[] {
  const firstMonday = weekMondayOf(today);
  const windows: CapacityWindow[] = [];

  for (let i = 0; i < lookAheadWeeks; i++) {
    const mondayDate = new Date(`${firstMonday}T00:00:00.000Z`);
    mondayDate.setUTCDate(mondayDate.getUTCDate() + 7 * i);
    const weekStart = isoDate(mondayDate);

    // Friday of the same week
    const fridayDate = new Date(mondayDate.getTime() + 4 * 24 * 3_600_000);
    const weekEnd = isoDate(fridayDate);

    // Capacity window end is start of Saturday (exclusive)
    const saturdayDate = new Date(mondayDate.getTime() + 5 * 24 * 3_600_000);
    const windowEnd = saturdayDate.toISOString();

    const model = buildCapacityModel(sessions, capacityByPhase, `${weekStart}T00:00:00.000Z`, windowEnd);
    const freeHoursByPhase = phaseAvailableHours(model);

    const isBookable = PHASES.every((p) => freeHoursByPhase[p] >= MIN_BOOKABLE_HOURS);

    windows.push({
      weekStart,
      weekEnd,
      label: weekLabel(weekStart),
      freeHoursByPhase,
      isBookable,
    });
  }

  return windows;
}

/**
 * Forward/backward combination: find the earliest bookable start slot.
 *
 * Forward pass — iterate windows from today onward, looking for the first
 * week where all phase work-centers have ≥ MIN_BOOKABLE_HOURS free hours.
 *
 * Backward confirmation — by definition the returned window passes the
 * all-phase check, confirming that a new job starting that Monday does not
 * breach any work-center's capacity. If the owner also specifies a desired
 * delivery date, they can chain the phase durations forward from this start
 * to verify the job finishes before that deadline (backward from deadline).
 *
 * Returns null when no bookable window exists within the lookahead.
 */
export function findEarliestBookableStart(windows: CapacityWindow[]): BookableSlot | null {
  const found = windows.find((w) => w.isBookable);
  if (!found) return null;
  return {
    weekStart: found.weekStart,
    weekEnd: found.weekEnd,
    label: found.label,
    freeHoursByPhase: found.freeHoursByPhase,
  };
}
