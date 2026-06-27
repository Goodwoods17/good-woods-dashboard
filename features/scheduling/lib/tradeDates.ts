/**
 * S11 — Trade-line dates + sub dependency wiring + sub request/confirm +
 * accountability (issue #99). Pure + dependency-free. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Four responsibilities:
 *  1. `blockerPhaseBurnDays` — extra buffer days consumed by active phase-gated
 *     blockers (the blocker freezes the phase, which burns into the buffer).
 *  2. `computeSubReliabilityBufferDays` — extra buffer days per sub based on
 *     their historical miss rate (worse reliability = more buffer next time).
 *  3. `missedSubDateBlockerReason` — the auto-raise reason text when a sub misses
 *     their committed date (attributes blame to the sub, not the shop).
 *  4. `shouldAutoRaiseMissedBlocker` — trigger condition: committed date passed +
 *     status is not 'done' → a blocker should be raised and reliability dinged.
 */

import type { JobBlocker } from "@shared/lib/types";
import type { PhaseTargetDates } from "./schedule";
import type { JobTradeStatus } from "@features/partners/lib/types";

export { type PhaseTargetDates };

/** A row from the `subtrade_reliability` table (mirrored in features/partners/lib). */
export type SubtradeReliabilityRecord = {
  subtradeId: string;
  jobTradeId: string;
  committedDate: string;
  actualDoneDate: string | null;
  missed: boolean;
  recordedAt: string;
};

// ── Work-day helper ────────────────────────────────────────────────────────────

/**
 * Count of work days (Mon–Fri, UTC) from `fromISO` to `toISO`. Positive when
 * `to` is in the future relative to `from`. Mirrors the semantics in bufferBurn.ts.
 */
function workDaysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T00:00:00.000Z`);
  const to = new Date(`${toISO.slice(0, 10)}T00:00:00.000Z`);
  const sign = to >= from ? 1 : -1;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (sign > 0 ? cursor < to : cursor > to) {
    cursor.setUTCDate(cursor.getUTCDate() + sign);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += sign;
  }
  return count;
}

// ── 1. Blocker phase burn ──────────────────────────────────────────────────────

/**
 * Total buffer days consumed by active phase-gated blockers.
 *
 * A blocker with `gatedPhaseId` set freezes that phase — the phase cannot
 * advance while the blocker is active. Every work day past the phase's internal
 * target date burns one day of the pooled buffer (ADR 0013). Whole-job blockers
 * (`gatedPhaseId = null`) flag health only and are NOT counted here.
 */
export function blockerPhaseBurnDays(
  activeBlockers: JobBlocker[],
  phaseTargetDates: PhaseTargetDates | null | undefined,
  today: Date
): number {
  const todayISO = today.toISOString().slice(0, 10);
  let total = 0;
  for (const b of activeBlockers) {
    if (b.resolvedAt) continue;
    if (!b.gatedPhaseId) continue;
    const phaseTarget = phaseTargetDates?.[b.gatedPhaseId];
    if (!phaseTarget) continue;
    const burn = workDaysBetween(phaseTarget, todayISO);
    if (burn > 0) total += burn;
  }
  return total;
}

// ── 2. Sub reliability buffer ──────────────────────────────────────────────────

/**
 * Extra buffer days to add because subs on this job have a history of missing
 * dates. Computed per sub (grouped by `subtradeId`):
 *   missRate = missedCount / totalCount
 *   extra    = ceil(missRate × baseDaysPerSub)
 * The totals across all subs are summed. A sub with a 100% miss rate earns the
 * full `baseDaysPerSub`; a perfect sub earns nothing extra. Works in tandem with
 * `computeRiskTieredBuffer`'s `subDependencyCount` term — this is the reliability
 * multiplier layer on top of the base sub-contingency.
 */
export function computeSubReliabilityBufferDays(
  records: SubtradeReliabilityRecord[],
  baseDaysPerSub = 3
): number {
  if (records.length === 0) return 0;

  // Group records by subtrade.
  const bySubtrade = new Map<string, SubtradeReliabilityRecord[]>();
  for (const r of records) {
    const group = bySubtrade.get(r.subtradeId) ?? [];
    group.push(r);
    bySubtrade.set(r.subtradeId, group);
  }

  let total = 0;
  bySubtrade.forEach((group) => {
    const missCount = group.filter((r) => r.missed).length;
    if (missCount === 0) return;
    const missRate = missCount / group.length;
    total += Math.ceil(missRate * baseDaysPerSub);
  });
  return total;
}

// ── 3. Missed-date blocker reason ─────────────────────────────────────────────

/**
 * Auto-raise reason text for a missed sub committed date. Attributes the delay
 * to the sub (their accountability), not to the shop (not "your" delay).
 */
export function missedSubDateBlockerReason(
  tradeName: string,
  subtradeName: string,
  committedDate: string
): string {
  return (
    `${subtradeName} missed their committed ${tradeName} date of ${committedDate}. ` +
    `Chasing ${subtradeName} for a revised date.`
  );
}

// ── 4. Auto-raise trigger ─────────────────────────────────────────────────────

/**
 * Whether a trade line's sub committed date has passed without the trade being
 * marked done — the trigger for auto-raising a job_blockers row.
 *
 * Rules:
 *   - No committed date → false (nothing to check)
 *   - Status is 'done' → false (delivered, even if late)
 *   - Committed date is today → false (give them the day)
 *   - Committed date is strictly in the past → true
 */
export function shouldAutoRaiseMissedBlocker(
  subCommittedDate: string | null | undefined,
  status: JobTradeStatus,
  today: Date
): boolean {
  if (!subCommittedDate) return false;
  if (status === "done") return false;
  const todayISO = today.toISOString().slice(0, 10);
  return subCommittedDate < todayISO;
}
