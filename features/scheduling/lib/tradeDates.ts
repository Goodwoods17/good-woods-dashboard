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
import { workDaysBetween } from "@shared/lib/workdays";
import type { PhaseTargetDates } from "./schedule";
import type { JobTradeStatus } from "@features/partners/lib/types";
import { ownerReliabilityBufferDays, type OwnerReliabilityRecord } from "./commitmentLedger";

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
 *
 * This is the sub-only special case of S13's `ownerReliabilityBufferDays`: a sub
 * record IS an owner record with `kind: "subtrade"` and `ownerId = subtradeId`,
 * so grouping by `kind:id` collapses to grouping by `subtradeId`. We map the
 * records and delegate, keeping ONE implementation of the reliability math. The
 * output is provably identical (locked by a shared-fixture test in
 * `tradeDates.test.ts`).
 */
export function computeSubReliabilityBufferDays(
  records: SubtradeReliabilityRecord[],
  baseDaysPerSub = 3
): number {
  const ownerRecords: OwnerReliabilityRecord[] = records.map((r) => ({
    ownerKind: "subtrade",
    ownerId: r.subtradeId,
    // name is irrelevant to grouping (ownerId is non-null) and to the buffer
    // math; mirror the id so the owner-key collapses to per-subtrade grouping.
    ownerName: r.subtradeId,
    committedDate: r.committedDate,
    actualDate: r.actualDoneDate,
    missed: r.missed,
  }));
  return ownerReliabilityBufferDays(ownerRecords, baseDaysPerSub);
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
