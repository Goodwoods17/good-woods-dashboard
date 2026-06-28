/**
 * The buffer lifecycle facade — one seam for "what is this job's buffer state?".
 * Pure; it COMPOSES the existing buffer functions and never reimplements the
 * math, so every computed buffer / date value is identical to calling the
 * underlying functions directly. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED
 * (off in prod).
 *
 * The CCPM buffer (docs/domain.md "Buffer") — the pooled gap between the internal
 * target and the frozen client-committed install date — has a three-stage
 * lifecycle. This module gives each stage one obvious home:
 *
 *   1. SIZE    — `sizeBuffer` (= `computeRiskTieredBuffer`, committedDate.ts):
 *                sizes the pool from base% + sub-deps + variance + owner
 *                reliability, or the per-job override (`jobs.buffer_days`).
 *   2. CONSUME — `bufferState` (wraps `computeBufferBurn`, bufferBurn.ts): how
 *                much of that pool has burned as of `today`, in work days + %.
 *   3. ZONE    — `bufferState` then classifies the burn against chain progress
 *                on the 2-D fever chart (`feverZone`, bufferBurn.ts) →
 *                green / yellow / red.
 *
 * `changeOrderImpact` (re-exported, recommit.ts) closes the loop: added scope
 * either absorbs into the remaining buffer or pushes the committed date out.
 */

import { computeBufferBurn, feverZone, type FeverZone } from "./bufferBurn";

// ── 1. SIZE ──────────────────────────────────────────────────────────────────
// Re-exported from the canonical home (committedDate.ts) so existing importers
// keep working unchanged while the facade gives sizing a lifecycle-named seam.
export {
  computeRiskTieredBuffer as sizeBuffer,
  computeRiskTieredBuffer,
  BASE_BUFFER_PCT,
  DAYS_PER_SUB_DEPENDENCY,
  type RiskBufferInput,
  type RiskBufferBreakdown,
} from "./committedDate";

// ── 2. CONSUME + 3. ZONE ─────────────────────────────────────────────────────

export type { FeverZone };

export type BufferState = {
  /** Total pooled buffer (work days): internal target → committed date. */
  totalDays: number;
  /** Work days burned past the internal target as of `today` (0 if still ahead). */
  consumedDays: number;
  /** Remaining buffer (work days); negative = over-committed. */
  remainingDays: number;
  /** Consumed as a % of the pool (>100 once past the committed date). */
  consumedPct: number;
  /** Critical-chain completion % the burn is judged against (fever-chart X axis). */
  chainPct: number;
  /** Fever-chart zone for (consumedPct, chainPct). */
  zone: FeverZone;
};

/**
 * The buffer's CONSUME + ZONE state in one call. Mirrors the current call
 * sequence exactly —
 * `feverZone(computeBufferBurn(internalTargetDate, committedDate, today).bufferConsumedPct, chainPct)`
 * — so the numbers are identical to invoking the two functions separately.
 *
 * `chainPct` (the fever chart's X axis) is supplied by the caller because it
 * comes from the milestone pointer / live job-status item counts
 * (`chainCompletionPct`), not from the buffer dates.
 */
export function bufferState(
  internalTargetDate: string,
  committedDate: string,
  today: Date,
  chainPct: number
): BufferState {
  const burn = computeBufferBurn(internalTargetDate, committedDate, today);
  return {
    totalDays: burn.totalBufferDays,
    consumedDays: burn.consumedBufferDays,
    remainingDays: burn.remainingBufferDays,
    consumedPct: burn.bufferConsumedPct,
    chainPct,
    zone: feverZone(burn.bufferConsumedPct, chainPct),
  };
}

// ── Change-order (loops back to SIZE) ────────────────────────────────────────
export { changeOrderImpact, type ChangeOrderImpact } from "./recommit";
