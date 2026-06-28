import { MILESTONE_STAGES, type MilestoneStage } from "@shared/lib/types";
import { addWorkDays } from "@shared/lib/workdays";

/**
 * Phase-level CAPACITY / LOAD model for the Scheduling & Client-Commitment
 * Engine (milestone #7, issue #90). The six `MilestoneStage` phases double as
 * shop work-centers; this slice derives their weekly LOAD from real
 * `labour_sessions` active-time history — and seeds a new job's default phase
 * durations from that same data (the "garbage-in fix": stop guessing durations,
 * use the minutes the shop has actually logged).
 *
 * Pure + dependency-free so it unit-tests without React/Supabase. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod). Non-goal this slice: per-machine
 * / per-person capacity, editing capacity in the UI, buffer-burn, Gantt.
 */

const HOUR_MS = 3_600_000;

/** A full work day of active shop time, for hours→days conversion. */
export const HOURS_PER_WORK_DAY = 8;

/** The six phases, in their canonical milestone order. */
const PHASES: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);
const PHASE_SET = new Set<string>(PHASES);

/**
 * Minimal labour-session shape this model needs — a structural subset of
 * `LabourSession` (features/labour) so the model stays decoupled from that
 * client store and its React/Supabase imports.
 */
export type CapacitySession = {
  categoryId: string | null; // snapshot phase tag (= labour_categories.id = a MilestoneStage)
  jobId: string | null;
  startedAt: string;
  endedAt: string | null; // null = still running → not history yet
  accumulatedMs: number; // active total banked on Stop (pauses excluded)
  resumedAt: string | null;
};

export type PhaseHours = Record<MilestoneStage, number>;

/** Default weekly active-time capacity per phase work-center (hours). Seeded
 * into `scheduling_phase_capacity`; a sane one-week-of-shop-time starting point
 * the owner can later tune. Used as the fallback when the table is unreadable. */
export const DEFAULT_WEEKLY_CAPACITY_HOURS: PhaseHours = {
  design: 40,
  cnc: 40,
  assembly: 40,
  finishing: 40,
  delivery: 40,
  install: 40,
};

/** Fallback phase durations (work days) for a brand-new job before any history
 * exists. Replaced phase-by-phase by `seedPhaseDurationsFromHistory` as soon as
 * the shop has logged real time for that phase. */
export const DEFAULT_PHASE_DURATION_DAYS: Record<MilestoneStage, number> = {
  design: 5,
  cnc: 3,
  assembly: 5,
  finishing: 3,
  delivery: 1,
  install: 2,
};

const zeroHours = (): PhaseHours => ({
  design: 0,
  cnc: 0,
  assembly: 0,
  finishing: 0,
  delivery: 0,
  install: 0,
});

/**
 * Active hours logged by ONE completed session (pauses excluded). Mirrors
 * labour's `durationMs` semantics: a stopped row carries its full active total
 * in `accumulatedMs`; legacy pre-pause rows (accumulated 0, never resumed) fall
 * back to wall-clock start→end so historical averages survive. Running sessions
 * (no `endedAt`) are not history yet and count as zero.
 */
export function sessionActiveHours(s: CapacitySession): number {
  if (!s.endedAt) return 0;
  if (s.accumulatedMs === 0 && s.resumedAt == null) {
    const wall = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
    return Math.max(0, wall) / HOUR_MS;
  }
  return Math.max(0, s.accumulatedMs) / HOUR_MS;
}

/**
 * Total active hours per phase for the completed sessions whose `startedAt`
 * falls within [windowStart, windowEnd). Sessions tagged to an unknown / null
 * phase are dropped — only the six work-centers count.
 */
export function phaseLoadHours(
  sessions: CapacitySession[],
  windowStart: string,
  windowEnd: string
): PhaseHours {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const load = zeroHours();
  for (const s of sessions) {
    if (!s.endedAt) continue;
    if (s.categoryId == null || !PHASE_SET.has(s.categoryId)) continue;
    const at = new Date(s.startedAt).getTime();
    if (at < startMs || at >= endMs) continue;
    load[s.categoryId as MilestoneStage] += sessionActiveHours(s);
  }
  return load;
}

export type UtilizationStatus = "under" | "near" | "over";

/** The warning band: at/above this fraction of capacity is "near" (amber). */
const NEAR_THRESHOLD = 0.85;

export type Utilization = { ratio: number; status: UtilizationStatus };

/**
 * Load vs. capacity for one phase. Over 100% = over capacity; any load against
 * zero capacity is over (can't do work with no work-center). No load + no
 * capacity reads as under (ratio 0), not a divide-by-zero.
 */
export function phaseUtilization(loadHours: number, capacityHours: number): Utilization {
  if (capacityHours <= 0) {
    return loadHours > 0
      ? { ratio: Number.POSITIVE_INFINITY, status: "over" }
      : { ratio: 0, status: "under" };
  }
  const ratio = loadHours / capacityHours;
  const status: UtilizationStatus = ratio > 1 ? "over" : ratio >= NEAR_THRESHOLD ? "near" : "under";
  return { ratio, status };
}

export type PhaseCapacityRow = {
  phase: MilestoneStage;
  label: string;
  loadHours: number;
  capacityHours: number;
  ratio: number;
  status: UtilizationStatus;
};

/**
 * The full weekly capacity/load model: one row per phase work-center with its
 * derived load (from history), configured capacity, and utilization status —
 * always all six phases, in milestone order.
 */
export function buildCapacityModel(
  sessions: CapacitySession[],
  capacityByPhase: PhaseHours,
  windowStart: string,
  windowEnd: string
): PhaseCapacityRow[] {
  const load = phaseLoadHours(sessions, windowStart, windowEnd);
  return MILESTONE_STAGES.map(({ key, label }) => {
    const loadHours = load[key];
    const capacityHours = capacityByPhase[key] ?? 0;
    const { ratio, status } = phaseUtilization(loadHours, capacityHours);
    return { phase: key, label, loadHours, capacityHours, ratio, status };
  });
}

/**
 * Default phase durations (work days) for a NEW job, derived from labour
 * history: for each phase, the AVERAGE active hours PER JOB (sum each job's
 * logged hours for the phase, average across the jobs that touched it),
 * converted to work days and rounded UP. Phases with no history keep their
 * static fallback; a phase that has any history is at least one day.
 *
 * This is the "garbage-in fix" — a new job's internal targets start from what
 * the shop has actually done, not a hand-typed guess.
 */
export function seedPhaseDurationsFromHistory(
  sessions: CapacitySession[]
): Record<MilestoneStage, number> {
  // phase → jobId → summed active hours
  const byPhaseJob = new Map<MilestoneStage, Map<string, number>>();
  for (const s of sessions) {
    if (!s.endedAt) continue;
    if (s.categoryId == null || !PHASE_SET.has(s.categoryId)) continue;
    const phase = s.categoryId as MilestoneStage;
    const job = s.jobId ?? "__unassigned__";
    const jobs = byPhaseJob.get(phase) ?? new Map<string, number>();
    jobs.set(job, (jobs.get(job) ?? 0) + sessionActiveHours(s));
    byPhaseJob.set(phase, jobs);
  }

  const out = { ...DEFAULT_PHASE_DURATION_DAYS };
  for (const phase of PHASES) {
    const jobs = byPhaseJob.get(phase);
    if (!jobs || jobs.size === 0) continue;
    let sum = 0;
    jobs.forEach((h) => {
      sum += h;
    });
    const avgHoursPerJob = sum / jobs.size;
    out[phase] = Math.max(1, Math.ceil(avgHoursPerJob / HOURS_PER_WORK_DAY));
  }
  return out;
}

/**
 * Chain per-phase durations (work days) from a start date into per-phase
 * INTERNAL target dates (the S1 `phase_target_dates` shape). Each phase's
 * target is the running cursor advanced by that phase's duration, non-working
 * days skipped — so seeding a new job from history produces honest internal
 * dates.
 */
export function phaseTargetDatesFromDurations(
  startDate: string,
  durations: Record<MilestoneStage, number>
): Record<MilestoneStage, string> {
  let cursor = startDate.slice(0, 10);
  const out = {} as Record<MilestoneStage, string>;
  for (const phase of PHASES) {
    cursor = addWorkDays(cursor, Math.max(0, durations[phase] ?? 0));
    out[phase] = cursor;
  }
  return out;
}
