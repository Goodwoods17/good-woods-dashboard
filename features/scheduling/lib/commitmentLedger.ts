/**
 * S13 — Commitment ledger + two-level ownership + per-owner/sub reliability
 * (issue #101). Pure + dependency-free. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Dates-as-promises (Flores / Last-Planner): every date on a job is an explicit
 * commitment with a NAMED OWNER, at two levels:
 *   1. The client-committed install date — owned by the shop.
 *   2. Each phase's internal target — owned by its assigned person / subtrade
 *      (the shop by default when no one is named).
 *
 * The ledger is DERIVED at read time from the job (install date, phase targets,
 * per-phase owners) — never stored, so it can never drift from the source data.
 *
 * Reliability is tracked PER OWNER, including subtrades. An owner with a history
 * of missing their committed dates earns extra pooled buffer on the next job
 * (`ownerReliabilityBufferDays`) — the buffer learns which owners to trust. This
 * generalizes S11's subtrade-only `computeSubReliabilityBufferDays` across every
 * owner kind (shop / person / subtrade), and feeds the S3 risk-tiered buffer.
 */

import {
  MILESTONE_STAGES,
  type MilestoneStage,
  type Job,
  type CommitmentOwner,
} from "@shared/lib/types";

export type { CommitmentOwner };

export type OwnerKind = CommitmentOwner["kind"];

/** Two ownership levels: the shop's client promise vs. an internal phase promise. */
export type CommitmentLevel = "client" | "phase";

/** A commitment's outcome relative to today / phase progress. */
export type CommitmentStatus = "open" | "kept" | "missed";

/** The default owner of any unassigned commitment: the shop itself. */
export const SHOP_OWNER: CommitmentOwner = { kind: "shop", id: null, name: "Good Woods" };

/** One row in the derived commitment ledger. */
export type LedgerEntry = {
  level: CommitmentLevel;
  /** The phase this commitment belongs to, or null for the client-level install. */
  phase: MilestoneStage | null;
  /** Human-facing label (phase name, or "Client install"). */
  label: string;
  owner: CommitmentOwner;
  /** ISO YYYY-MM-DD promised date. */
  committedDate: string;
  status: CommitmentStatus;
};

/** A historical date-keeping record for ANY owner (generalizes subtrade_reliability). */
export type OwnerReliabilityRecord = {
  ownerKind: OwnerKind;
  ownerId: string | null;
  ownerName: string;
  committedDate: string;
  actualDate: string | null;
  missed: boolean;
};

/** Per-owner reliability roll-up. */
export type OwnerReliabilitySummary = {
  ownerKey: string;
  ownerKind: OwnerKind;
  ownerName: string;
  total: number;
  kept: number;
  missed: number;
  /** missed / total, in [0, 1]. */
  missRate: number;
};

const PHASES: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);
const PHASE_LABEL = new Map(MILESTONE_STAGES.map((s) => [s.key, s.label]));

/**
 * A stable identity key for an owner. Prefers `kind:id` (so two subs with the
 * same display name never collide); falls back to `kind:name` for owners with no
 * id (the shop, or an ad-hoc named owner).
 */
export function ownerKey(owner: Pick<CommitmentOwner, "kind" | "id" | "name">): string {
  return `${owner.kind}:${owner.id ?? owner.name}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Derive a commitment's status. A phase already passed (the job has moved beyond
 * it) is `kept`; otherwise a committed date strictly before today is `missed`,
 * and a date today-or-later is still `open`.
 */
function deriveStatus(
  committedDate: string,
  isComplete: boolean,
  todayISO: string
): CommitmentStatus {
  if (isComplete) return "kept";
  if (committedDate < todayISO) return "missed";
  return "open";
}

/**
 * Build the commitment ledger for a job: the client-committed install first
 * (shop-owned), then one entry per phase that has a target date, in milestone
 * order, each with its named owner (or the shop by default).
 */
export function buildCommitmentLedger(job: Job, today: Date): LedgerEntry[] {
  const todayISO = isoDate(today);
  const currentIndex = PHASES.indexOf(job.currentMilestone);
  const entries: LedgerEntry[] = [];

  // ── Client-level install (owned by the shop) ──
  // The install is "kept" only once the job has moved past install — which can't
  // happen (install is the last phase) — so it stays open/missed by date alone.
  entries.push({
    level: "client",
    phase: null,
    label: "Client install",
    owner: SHOP_OWNER,
    committedDate: job.installDate,
    status: deriveStatus(job.installDate, false, todayISO),
  });

  // ── Per-phase internal commitments ──
  const targets = job.phaseTargetDates ?? {};
  const owners = job.phaseOwners ?? {};
  PHASES.forEach((phase, idx) => {
    const committedDate = targets[phase];
    if (!committedDate) return;
    const isComplete = idx < currentIndex;
    entries.push({
      level: "phase",
      phase,
      label: PHASE_LABEL.get(phase) ?? phase,
      owner: owners[phase] ?? SHOP_OWNER,
      committedDate,
      status: deriveStatus(committedDate, isComplete, todayISO),
    });
  });

  return entries;
}

/**
 * Roll up reliability records per owner, sorted worst-first (highest miss rate,
 * then most records). Works across every owner kind — including subtrades — so a
 * single view can compare the shop's own date-keeping with its subs'.
 */
export function computeOwnerReliability(
  records: OwnerReliabilityRecord[]
): OwnerReliabilitySummary[] {
  const byOwner = new Map<string, OwnerReliabilityRecord[]>();
  for (const r of records) {
    const key = ownerKey({ kind: r.ownerKind, id: r.ownerId, name: r.ownerName });
    const group = byOwner.get(key) ?? [];
    group.push(r);
    byOwner.set(key, group);
  }

  const summaries: OwnerReliabilitySummary[] = [];
  byOwner.forEach((group, key) => {
    const missed = group.filter((r) => r.missed).length;
    const total = group.length;
    summaries.push({
      ownerKey: key,
      ownerKind: group[0].ownerKind,
      ownerName: group[0].ownerName,
      total,
      kept: total - missed,
      missed,
      missRate: total === 0 ? 0 : missed / total,
    });
  });

  summaries.sort((a, b) => b.missRate - a.missRate || b.total - a.total);
  return summaries;
}

/**
 * Extra pooled-buffer days earned because owners on this job have a history of
 * missing dates. Per owner: `ceil(missRate × baseDaysPerOwner)`, summed across
 * owners. A perfect owner earns nothing; a 100%-miss owner earns the full base.
 * Generalizes S11's `computeSubReliabilityBufferDays` to all owner kinds and
 * feeds the S3 risk-tiered buffer's owner-reliability term.
 */
export function ownerReliabilityBufferDays(
  records: OwnerReliabilityRecord[],
  baseDaysPerOwner = 3
): number {
  const summaries = computeOwnerReliability(records);
  let total = 0;
  for (const s of summaries) {
    if (s.missed === 0) continue;
    total += Math.ceil(s.missRate * baseDaysPerOwner);
  }
  return total;
}
