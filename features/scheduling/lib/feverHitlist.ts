import { type Job } from "@shared/lib/types";
import { chainCompletionPct, type FeverZone } from "./bufferBurn";
import { bufferState } from "./buffer";
import { phaseIndex } from "./phases";

/**
 * S9 — Owner fever-chart hitlist + "one number to watch" (issue #97).
 *
 * Pure + dependency-free. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED.
 *
 * Ranks every active job by buffer-health severity so the owner sees at a
 * glance which commitments are at risk. Jobs without an internal target date
 * fall to the bottom — unranked, prompting the owner to schedule them.
 *
 * The "one number to watch" is `summary.commitmentsAtRisk`: the count of RED-zone
 * jobs — commitments whose buffer is being consumed faster than progress justifies.
 * Non-PMs don't need the 2D chart; they need this single integer to know whether
 * to act.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type FeverHitlistEntry = {
  job: Job;
  /** null = unscheduled (no internalTargetDate set yet). */
  zone: FeverZone | null;
  /** 0–100: how far through the critical chain this job is (phase pointer only). */
  chainCompletionPct: number;
  /** 0–100 (can exceed 100): buffer consumed as % of total pool. */
  bufferConsumedPct: number;
  /** Remaining buffer days (can be negative if we're past the committed date). */
  remainingBufferDays: number;
  /** jobs.installDate — the frozen client-committed promise. */
  committedDate: string;
};

export type ShopHealthSummary = {
  /** Jobs that have an internal target date and can be fever-charted. */
  totalScheduled: number;
  /** Jobs without any internal target date — not yet on the schedule board. */
  totalUnscheduled: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  unscheduledCount: number;
  /**
   * The "one number to watch": count of RED-zone jobs whose buffer is being
   * consumed faster than their critical-chain progress justifies. These are the
   * commitments most at risk of slipping past the client-committed date.
   */
  commitmentsAtRisk: number;
};

// ── Zone → sort rank (lower = more urgent) ──────────────────────────────────

const ZONE_RANK: Record<FeverZone, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Builds the shop-wide fever hitlist from the full job list.
 *
 * Ranking:
 *   1. RED (sorted by bufferConsumedPct desc — worst first)
 *   2. YELLOW (sorted by bufferConsumedPct desc)
 *   3. GREEN (sorted by bufferConsumedPct desc — consume least buffer first so
 *      the most-stressed "green" jobs appear at the top of the green band)
 *   4. Unscheduled (sorted by installDate asc — closest deadline first)
 */
export function buildFeverHitlist(
  jobs: Job[],
  today: Date
): { entries: FeverHitlistEntry[]; summary: ShopHealthSummary } {
  const scheduled: FeverHitlistEntry[] = [];
  const unscheduled: FeverHitlistEntry[] = [];

  for (const job of jobs) {
    const internalTarget = job.internalTargetDate ?? null;

    if (!internalTarget) {
      unscheduled.push({
        job,
        zone: null,
        chainCompletionPct: 0,
        bufferConsumedPct: 0,
        remainingBufferDays: 0,
        committedDate: job.installDate,
      });
      continue;
    }

    // Derive chain completion % from the milestone phase pointer.
    const milestoneIndex = phaseIndex(job.currentMilestone);
    const currentMilestoneIndex = milestoneIndex < 0 ? 0 : milestoneIndex;
    const chainPct = chainCompletionPct({ currentMilestoneIndex });

    // CONSUME + ZONE in one facade call: buffer burn (internalTargetDate →
    // installDate) classified against chain progress on the fever chart.
    const state = bufferState(internalTarget, job.installDate, today, chainPct);

    scheduled.push({
      job,
      zone: state.zone,
      chainCompletionPct: chainPct,
      bufferConsumedPct: state.consumedPct,
      remainingBufferDays: state.remainingDays,
      committedDate: job.installDate,
    });
  }

  // Sort scheduled by zone severity, then Priority/VIP wins ties within a zone
  // (S17 — issue #105), then by bufferConsumedPct desc within the same zone+priority.
  scheduled.sort((a, b) => {
    const aZone = a.zone as FeverZone;
    const bZone = b.zone as FeverZone;
    const rankDiff = ZONE_RANK[aZone] - ZONE_RANK[bZone];
    if (rankDiff !== 0) return rankDiff;
    // Priority jobs float first within the same zone.
    const aPri = a.job.isPriority ? 0 : 1;
    const bPri = b.job.isPriority ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    return b.bufferConsumedPct - a.bufferConsumedPct;
  });

  // Sort unscheduled by priority first (S17), then installDate ascending.
  unscheduled.sort((a, b) => {
    const aPri = a.job.isPriority ? 0 : 1;
    const bPri = b.job.isPriority ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    return a.job.installDate.localeCompare(b.job.installDate);
  });

  const entries = [...scheduled, ...unscheduled];

  const redCount = scheduled.filter((e) => e.zone === "red").length;
  const yellowCount = scheduled.filter((e) => e.zone === "yellow").length;
  const greenCount = scheduled.filter((e) => e.zone === "green").length;

  const summary: ShopHealthSummary = {
    totalScheduled: scheduled.length,
    totalUnscheduled: unscheduled.length,
    redCount,
    yellowCount,
    greenCount,
    unscheduledCount: unscheduled.length,
    commitmentsAtRisk: redCount,
  };

  return { entries, summary };
}
