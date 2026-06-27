import { MILESTONE_STAGES, type MilestoneStage } from "@shared/lib/types";
import {
  HOURS_PER_WORK_DAY,
  sessionActiveHours,
  type CapacitySession,
  type PhaseCapacityRow,
} from "./capacity";

/**
 * S3 — Capacity-aware committed date + risk-tiered buffer + floating-bottleneck
 * detection (issue #91). Pure + dependency-free. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Three additions to the scheduling model:
 *  1. `computeCapacityAwareSchedule` — forward-schedules a job using phase
 *     durations stretched by the current load ratio, so the internal target date
 *     reflects the shop's actual throughput rather than a flat guess.
 *  2. `computeRiskTieredBuffer` — sizes the pooled buffer from three honest
 *     components (base %, sub-trade dependencies, historical variance) instead of
 *     a single flat number. Overridable per job.
 *  3. `detectFloatingBottleneck` — the most-overloaded phase work-center in the
 *     current window, auto-detected from the S2 capacity model. Floats weekly.
 */

const PHASES: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);
const PHASE_KEYS = new Set<string>(PHASES);

// ── Constants ──────────────────────────────────────────────────────────────

/** Base buffer as a fraction of the total internal work-day chain. */
export const BASE_BUFFER_PCT = 0.15;

/**
 * Extra buffer days added per external sub-trade dependency (e.g. CNC shop,
 * spray finisher). Each sub can introduce schedule risk the shop can't control.
 */
export const DAYS_PER_SUB_DEPENDENCY = 3;

/**
 * Cap on the capacity-stretch multiplier so an infinitely-loaded work-center
 * doesn't produce absurd schedule projections. 3× base is already very bad.
 */
export const MAX_CAPACITY_STRETCH = 3.0;

// ── Helpers ────────────────────────────────────────────────────────────────

/** ISO `YYYY-MM-DD` of a Date in UTC (date is a date, not an instant). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Advance `n` work days (Mon–Fri, UTC) from a UTC-anchored date. */
function addWorkDays(start: Date, n: number): Date {
  const d = new Date(start.getTime());
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

// ── 1. Capacity-aware schedule ─────────────────────────────────────────────

/**
 * Stretch a phase's base duration (work days) proportionally when its load ratio
 * exceeds 1 (over capacity), capped at MAX_CAPACITY_STRETCH × base so that a
 * very overloaded phase doesn't produce an absurd projection. Phases at or under
 * capacity are unchanged.
 */
export function capacityAdjustedDuration(baseDays: number, ratio: number): number {
  if (baseDays <= 0) return 0;
  if (ratio <= 1) return baseDays;
  const stretch = Math.min(ratio, MAX_CAPACITY_STRETCH);
  return Math.ceil(baseDays * stretch);
}

export type CapacityAwareSchedule = {
  /** Per-phase internal target dates (ISO YYYY-MM-DD), stretched by capacity. */
  phaseTargetDates: Record<MilestoneStage, string>;
  /** The job-level internal finish: same date as the last phase target. */
  internalTargetDate: string;
  /** Total work days in the capacity-adjusted chain (used to size the buffer). */
  totalWorkDays: number;
};

/**
 * Forward-schedule a job from `startDate` using per-phase durations, stretching
 * each duration by the current load ratio so the result reflects the shop's real
 * throughput. If no capacity row exists for a phase the duration is used as-is
 * (ratio = 1). Weekends are skipped in the chain (same as S2).
 */
export function computeCapacityAwareSchedule(
  startDate: string,
  phaseDurations: Record<MilestoneStage, number>,
  phaseRows: PhaseCapacityRow[]
): CapacityAwareSchedule {
  const ratioFor = new Map(phaseRows.map((r) => [r.phase, r.ratio]));
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const phaseTargetDates = {} as Record<MilestoneStage, string>;
  let totalWorkDays = 0;

  for (const phase of PHASES) {
    const base = Math.max(0, phaseDurations[phase] ?? 0);
    const ratio = ratioFor.get(phase) ?? 1;
    const adjusted = capacityAdjustedDuration(base, ratio);
    totalWorkDays += adjusted;
    if (adjusted > 0) {
      cursor = addWorkDays(cursor, adjusted);
    }
    phaseTargetDates[phase] = isoDate(cursor);
  }

  return { phaseTargetDates, internalTargetDate: isoDate(cursor), totalWorkDays };
}

// ── 2. Risk-tiered buffer ──────────────────────────────────────────────────

export type RiskBufferInput = {
  /** Total internal schedule length in work days (the capacity-aware chain). */
  totalInternalDays: number;
  /** Number of external sub-trade dependencies (each adds a fixed contingency). */
  subDependencyCount: number;
  /**
   * Historical phase-variance nudge (work days). From `phaseVarianceNudgeDays`
   * when session data is available; 0 otherwise.
   */
  varianceNudgeDays?: number;
  /**
   * Owner's manual override. When non-null, the formula is bypassed entirely
   * — this is the `jobs.buffer_days` column in the DB.
   */
  overrideBufferDays?: number | null;
};

export type RiskBufferBreakdown = {
  /** Rounded-up base fraction of the total internal duration. */
  baseDays: number;
  /** Fixed days for sub-trade lead-time risk. */
  subDays: number;
  /** Historical phase-variance nudge. */
  varianceDays: number;
  /** Total: base + subs + variance, or the override if set. */
  totalDays: number;
  /** True when the job's stored buffer_days overrides the formula. */
  isOverridden: boolean;
};

/**
 * Risk-tiered buffer (work days) to insert between the internal target date and
 * the client-committed install date. Three auditable terms:
 *   base     = ceil(totalInternalDays × BASE_BUFFER_PCT) — scales with job size
 *   subs     = subDependencyCount × DAYS_PER_SUB_DEPENDENCY — lead-time contingency
 *   variance = varianceNudgeDays — how variable past phases actually were
 *
 * Overridable per job: if `overrideBufferDays` is non-null the formula is bypassed
 * and the override is returned directly (breakdown still captures the formula for
 * reference, with isOverridden = true).
 */
export function computeRiskTieredBuffer(input: RiskBufferInput): RiskBufferBreakdown {
  const { totalInternalDays, subDependencyCount, varianceNudgeDays = 0, overrideBufferDays } =
    input;
  const baseDays = Math.ceil(Math.max(0, totalInternalDays) * BASE_BUFFER_PCT);
  const subDays = Math.max(0, subDependencyCount) * DAYS_PER_SUB_DEPENDENCY;
  const varianceDays = Math.max(0, varianceNudgeDays);
  const formula = baseDays + subDays + varianceDays;

  if (overrideBufferDays != null) {
    return {
      baseDays,
      subDays,
      varianceDays,
      totalDays: Math.max(0, overrideBufferDays),
      isOverridden: true,
    };
  }

  return { baseDays, subDays, varianceDays, totalDays: formula, isOverridden: false };
}

/**
 * The client-committed install date: the internal target advanced by `bufferDays`
 * work days. Weekends are skipped; zero buffer returns the internal target itself.
 */
export function capacityAwareCommittedDate(
  internalTargetDate: string,
  bufferDays: number
): string {
  if (bufferDays <= 0) return internalTargetDate;
  const start = new Date(`${internalTargetDate}T00:00:00.000Z`);
  return isoDate(addWorkDays(start, bufferDays));
}

// ── 3. Phase-variance nudge ────────────────────────────────────────────────

/**
 * Derive a phase-variance nudge in work days from `labour_sessions` history.
 * For each phase with ≥ 2 completed jobs, the standard deviation of per-job
 * active hours is converted to days and summed. High variance → more buffer.
 * Phases with < 2 data points contribute 0 (not enough to read variance from).
 * Capped at `maxNudgeDays` to prevent runaway nudges from sparse/noisy data.
 */
export function phaseVarianceNudgeDays(
  sessions: CapacitySession[],
  maxNudgeDays = 5
): number {
  const byPhaseJob = new Map<MilestoneStage, Map<string, number>>();

  for (const s of sessions) {
    if (!s.endedAt) continue;
    if (s.categoryId == null || !PHASE_KEYS.has(s.categoryId)) continue;
    const phase = s.categoryId as MilestoneStage;
    const job = s.jobId ?? "__unassigned__";
    const jobs = byPhaseJob.get(phase) ?? new Map<string, number>();
    jobs.set(job, (jobs.get(job) ?? 0) + sessionActiveHours(s));
    byPhaseJob.set(phase, jobs);
  }

  let totalNudge = 0;
  for (const phase of PHASES) {
    const jobs = byPhaseJob.get(phase);
    if (!jobs || jobs.size < 2) continue;
    const values = Array.from(jobs.values());
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    totalNudge += Math.ceil(stdDev / HOURS_PER_WORK_DAY);
  }

  return Math.min(totalNudge, maxNudgeDays);
}

// ── 4. Floating bottleneck ─────────────────────────────────────────────────

/**
 * The most-overloaded phase work-center in the current window — the "floating
 * bottleneck." Returns null when every phase is under capacity (nothing is
 * constrained this week). Tiebreaks in milestone order (first overloaded wins).
 * Uses the S2 `PhaseCapacityRow[]` model so no re-computation is needed.
 */
export function detectFloatingBottleneck(phaseRows: PhaseCapacityRow[]): PhaseCapacityRow | null {
  const constrained = phaseRows.filter((r) => r.status === "over" || r.status === "near");
  if (constrained.length === 0) return null;
  return constrained.reduce((max, r) => (r.ratio > max.ratio ? r : max), constrained[0]);
}
