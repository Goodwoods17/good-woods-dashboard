/**
 * S17 — Priority/VIP flag + manual bump-with-impact (cross-job conflict
 * resolution) (issue #105). Pure + dependency-free beyond one internal import.
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Two interlocking behaviours:
 *
 *   1. PRIORITY FLAG — jobs.is_priority = true. A priority job wins ties in
 *      EDD/bottleneck advice and surfaces first in capacity conflicts (already
 *      baked into the buildFeverHitlist sort). This module exports sortWithPriority
 *      as a standalone utility for other callers (capacity advisor, estimator).
 *
 *   2. BUMP-WITH-IMPACT — the owner deliberately pushes one job's committed
 *      install date to protect a priority job. The system previews the cost
 *      ('pushing Henderson 4d protects Saywell → Henderson committed date moves
 *      to Mar 18, needs re-commit + client message') before committing. Once
 *      confirmed: the bump is logged in public.priority_bumps and the bumped
 *      job routes through the S14 re-commit + approval flow automatically.
 *
 * Decisions (issue #105): "You choose, system shows the cost. NOT auto-protect."
 * Every bump is a deliberate, human decision with a clear preview + reason.
 */

import { pushCommittedDate, friendlyDate } from "./recommit";

// ── Priority sort ────────────────────────────────────────────────────────────

/**
 * Sort any array of fever-hitlist-shaped entries so Priority/VIP jobs float
 * first within their zone. Within zone + same priority, existing order is kept
 * (the caller is responsible for the primary sort by zone + bufferConsumedPct).
 *
 * Generic so it works on FeverHitlistEntry[] without importing that type here
 * (avoids the circular import with feverHitlist.ts).
 */
export function sortWithPriority<
  T extends { job: { isPriority?: boolean }; zone: string | null; bufferConsumedPct: number },
>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    // Zone rank: lower = more urgent. null (unscheduled) sits last.
    const ZONE: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    const aZoneRank = a.zone !== null ? (ZONE[a.zone] ?? 3) : 3;
    const bZoneRank = b.zone !== null ? (ZONE[b.zone] ?? 3) : 3;
    if (aZoneRank !== bZoneRank) return aZoneRank - bZoneRank;

    // Within same zone: Priority/VIP wins ties.
    const aPri = a.job.isPriority ? 0 : 1;
    const bPri = b.job.isPriority ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;

    // Same zone + same priority: sort by bufferConsumedPct desc (most stressed first).
    return b.bufferConsumedPct - a.bufferConsumedPct;
  });
}

// ── Bump preview ─────────────────────────────────────────────────────────────

export type BumpPreview = {
  /** The priority job being protected. */
  priorityJobName: string;
  /** The job being pushed out. */
  bumpedJobName: string;
  /** Work days the bumped job's committed date is pushed. */
  bumpDays: number;
  /** The bumped job's committed date before the bump. */
  oldCommittedDate: string;
  /** The bumped job's new committed date after the bump (work-day arithmetic). */
  newCommittedDate: string;
  /**
   * Human-readable impact summary. Matches the design spec format:
   * "pushing Henderson 4d protects Saywell → Henderson committed date moves
   *  to Mar 18, needs re-commit + client message"
   */
  message: string;
};

/**
 * Compute the human-readable impact preview for bumping one job's committed
 * date to protect a priority job. The new committed date is computed using the
 * same work-day arithmetic as S14's pushCommittedDate (Mon–Fri, skips weekends).
 *
 * The preview is shown to the owner before they confirm — "you choose, system
 * shows the cost" (issue #105 spec). The bump is NOT applied until onBump fires.
 */
export function computeBumpImpact(params: {
  priorityJob: { id: string; name: string };
  bumpedJob: { id: string; name: string; installDate: string };
  bumpDays: number;
}): BumpPreview {
  const { priorityJob, bumpedJob, bumpDays } = params;
  const days = Math.max(1, Math.round(bumpDays));
  const newCommittedDate = pushCommittedDate(bumpedJob.installDate, days);
  const newPretty = friendlyDate(newCommittedDate);

  const message = `pushing ${bumpedJob.name} ${days}d protects ${priorityJob.name} → ${bumpedJob.name} committed date moves to ${newPretty}, needs re-commit + client message`;

  return {
    priorityJobName: priorityJob.name,
    bumpedJobName: bumpedJob.name,
    bumpDays: days,
    oldCommittedDate: bumpedJob.installDate,
    newCommittedDate,
    message,
  };
}

// ── Bump audit record ────────────────────────────────────────────────────────

export type PriorityBumpRecord = {
  id: string;
  priorityJobId: string;
  bumpedJobId: string;
  bumpDays: number;
  reason: string;
  oldCommittedDate: string | null;
  newCommittedDate: string;
  bumpedBy: string | null;
  bumpedAt: string;
};

function fallbackId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `bump-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Build an immutable audit record for a priority bump decision. One record per
 * confirmed bump — lands in public.priority_bumps (S17 migration). The record
 * is deliberately verbose: future reporting (who bumped whom, which priority
 * jobs caused the most disruption) reads from here.
 */
export function buildPriorityBumpRecord(input: {
  priorityJobId: string;
  bumpedJobId: string;
  bumpDays: number;
  reason: string;
  oldCommittedDate: string | null;
  newCommittedDate: string;
  bumpedBy?: string | null;
  bumpedAt?: string;
}): PriorityBumpRecord {
  return {
    id: fallbackId(),
    priorityJobId: input.priorityJobId,
    bumpedJobId: input.bumpedJobId,
    bumpDays: input.bumpDays,
    reason: input.reason,
    oldCommittedDate: input.oldCommittedDate,
    newCommittedDate: input.newCommittedDate,
    bumpedBy: input.bumpedBy ?? null,
    bumpedAt: input.bumpedAt ?? new Date().toISOString(),
  };
}
