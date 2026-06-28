import type { HealthStatus, JobBlocker } from "@shared/lib/types";
import { workDaysBetween } from "@shared/lib/workdays";

/**
 * S6 — Buffer consumption + fever chart + recovery flag (issue #94). Pure +
 * dependency-free. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Core CCPM concepts implemented here:
 *  1. `computeBufferBurn` — how much of the pooled buffer has been consumed
 *     (based on today vs. the internal target date).
 *  2. `chainCompletionPct` — what fraction of the job's critical chain is done
 *     (phase pointer + optional live job-status item progress adapter).
 *  3. `feverZone` — green/yellow/red classification from the 2D (X=chain%, Y=buffer%)
 *     fever chart. Thresholds are tunable.
 *  4. `computeRecoveryFlag` — internal private alert when the job hits RED. The
 *     client still sees "on track" externally; this is the owner's early-warning.
 *  5. `deriveHealthFromFever` — the fever signal now powers the unified health
 *     band, replacing the crude STAGE_LEAD_DAYS heuristic (jobs/lib/health.ts).
 */

// ── 1. Buffer burn ──────────────────────────────────────────────────────────

export type BufferBurnResult = {
  /** Total buffer pool in work days (internalTargetDate → committedDate). */
  totalBufferDays: number;
  /**
   * Work days the project has slipped past the internal target date (into the
   * buffer zone). 0 when we're still ahead of or on the internal target.
   * Can exceed totalBufferDays if today has passed the committed date.
   */
  consumedBufferDays: number;
  /** Remaining buffer: totalBufferDays − consumedBufferDays. Negative = over-committed. */
  remainingBufferDays: number;
  /**
   * Buffer consumed as a percentage of the total pool (0–100 normally, >100 when
   * we've blown past the committed date). 0 when totalBufferDays = 0 AND no slippage.
   */
  bufferConsumedPct: number;
};

/**
 * Computes how much of the pooled buffer has been consumed as of `today`.
 *
 * Buffer consumption starts when `today` crosses `internalTargetDate`: every
 * work day we haven't finished and are past the internal target burns one day
 * of buffer. The total pool is the work-day span between the internal target
 * and the client-committed date.
 */
export function computeBufferBurn(
  internalTargetDate: string,
  committedDate: string,
  today: Date
): BufferBurnResult {
  const todayISO = today.toISOString().slice(0, 10);
  const totalBufferDays = Math.max(0, workDaysBetween(internalTargetDate, committedDate));
  const rawConsumed = workDaysBetween(internalTargetDate, todayISO);
  const consumedBufferDays = Math.max(0, rawConsumed);
  const remainingBufferDays = totalBufferDays - consumedBufferDays;
  const bufferConsumedPct =
    totalBufferDays > 0
      ? (consumedBufferDays / totalBufferDays) * 100
      : consumedBufferDays > 0
        ? 100
        : 0;

  return { totalBufferDays, consumedBufferDays, remainingBufferDays, bufferConsumedPct };
}

// ── 2. Chain completion % ───────────────────────────────────────────────────

export type ChainProgressInput = {
  /**
   * The index of the current milestone in the MILESTONE_STAGES array (0–5).
   * Phases 0..index-1 are complete; the current phase is in progress.
   */
  currentMilestoneIndex: number;
  /** Total phases in the critical chain. Defaults to 6. */
  totalPhases?: number;
  /**
   * Items done in the current phase (from live job-status data — the adapter
   * from the phase pointer to piece/card counts, as called for in S6).
   * When both done and total are 0 (or omitted), within-phase progress = 0.
   */
  withinPhaseItemsDone?: number;
  withinPhaseItemsTotal?: number;
};

/**
 * What percentage (0–100) of the job's critical chain is complete.
 *
 * The formula blends two signals: (a) the phase pointer (how many phases have
 * been fully completed, coarse-grained) and (b) within-phase item progress from
 * the Live Job Status board — the "adapter" from phase pointer → pieces/cards.
 * Each full phase = 1/totalPhases of completion; partial within-phase item
 * progress refines the fraction for the current phase.
 */
export function chainCompletionPct(input: ChainProgressInput): number {
  const {
    currentMilestoneIndex,
    totalPhases = 6,
    withinPhaseItemsDone,
    withinPhaseItemsTotal,
  } = input;

  if (currentMilestoneIndex >= totalPhases) return 100;

  const withinPhaseFraction =
    withinPhaseItemsTotal && withinPhaseItemsTotal > 0
      ? (withinPhaseItemsDone ?? 0) / withinPhaseItemsTotal
      : 0;

  return ((currentMilestoneIndex + withinPhaseFraction) / totalPhases) * 100;
}

// ── 3. Fever zone ───────────────────────────────────────────────────────────

export type FeverZone = "green" | "yellow" | "red";

/**
 * The two diagonal boundary lines on the fever chart. Both are expressed as
 * ratios of bufferConsumedPct : chainCompletionPct — if you are consuming
 * buffer proportionally faster than you're making progress, you move through
 * yellow into red.
 */
export type FeverThresholds = {
  /** Buffer-to-chain ratio below which the job is GREEN (safe). Default: 1/3. */
  greenYellowRatio: number;
  /** Buffer-to-chain ratio above which the job is RED (danger). Default: 2/3. */
  yellowRedRatio: number;
};

export const DEFAULT_FEVER_THRESHOLDS: FeverThresholds = {
  greenYellowRatio: 1 / 3,
  yellowRedRatio: 2 / 3,
};

/**
 * Maps a (bufferConsumedPct, chainCompletionPct) point to a fever zone.
 *
 * The fever chart is a 2D plot — X = chain completion %, Y = buffer consumed %.
 * Two diagonal lines through the origin divide the chart into three zones:
 *
 *   GREEN  (safe):    Y ≤ X × greenYellowRatio
 *   YELLOW (warning): X × greenYellowRatio < Y ≤ X × yellowRedRatio
 *   RED    (danger):  Y > X × yellowRedRatio
 *
 * When X = 0 (no progress yet): any Y > 0 is RED; Y = 0 is GREEN.
 * When Y > 100 (past committed date): always RED.
 */
export function feverZone(
  bufferConsumedPct: number,
  chainPct: number,
  thresholds?: Partial<FeverThresholds>
): FeverZone {
  const gy = thresholds?.greenYellowRatio ?? DEFAULT_FEVER_THRESHOLDS.greenYellowRatio;
  const yr = thresholds?.yellowRedRatio ?? DEFAULT_FEVER_THRESHOLDS.yellowRedRatio;
  const greenBoundary = chainPct * gy;
  const redBoundary = chainPct * yr;

  if (bufferConsumedPct <= greenBoundary) return "green";
  if (bufferConsumedPct <= redBoundary) return "yellow";
  return "red";
}

// ── 4. Recovery flag ────────────────────────────────────────────────────────

export type RecoveryFlag = {
  /** True when the job has entered the RED zone — owner must act. */
  active: boolean;
  /** The fever zone that triggered (or did not trigger) this flag. */
  zone: FeverZone;
  /**
   * The internal early-warning message, shown ONLY to the owner. The client
   * still sees the regular schedule status ("On track") — this is the private
   * buffer that protects the committed promise.
   */
  message: string;
};

/**
 * Computes the internal recovery flag from the current fever zone. Active only
 * in the RED zone — at that point the buffer is being consumed faster than
 * progress justifies and the commitment is at risk.
 *
 * This is the private early-warning window: by design the client still sees the
 * committed date and "on track" externally. The flag prompts the owner to act
 * before the commitment itself is broken.
 */
export function computeRecoveryFlag(zone: FeverZone): RecoveryFlag {
  const active = zone === "red";
  return {
    active,
    zone,
    message: active ? "Commitment at risk — act now" : "",
  };
}

// ── 5. Health from fever ─────────────────────────────────────────────────────

/**
 * Derive the job's health status from the fever zone, replacing the crude
 * STAGE_LEAD_DAYS heuristic in `features/jobs/lib/health.ts` when the
 * scheduling engine is active and the job has internal schedule data.
 *
 * Precedence (same as `deriveHealth`):
 *   complete > paused > active blockers → blocked > fever zone
 *
 * Zone→health mapping:
 *   green  → on_track   (consuming buffer proportionally slower than progress)
 *   yellow → at_risk    (buffer burning faster; intervention may be needed)
 *   red    → blocked    (commitment at risk; escalates to the owner's hitlist)
 */
export function deriveHealthFromFever(
  zone: FeverZone,
  currentHealth: HealthStatus,
  activeBlockers: JobBlocker[] = []
): HealthStatus {
  if (currentHealth === "complete") return "complete";
  if (currentHealth === "paused") return "paused";
  if (activeBlockers.length > 0) return "blocked";

  switch (zone) {
    case "green":
      return "on_track";
    case "yellow":
      return "at_risk";
    case "red":
      return "blocked";
  }
}
