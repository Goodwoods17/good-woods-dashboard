import type { JobBlocker, MilestoneStage } from "@shared/lib/types";

/** Whole days since a blocker was raised, clamped to ≥0. */
export function blockerAgeDays(b: JobBlocker, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(b.raisedAt).getTime()) / 86_400_000));
}

/**
 * Human-readable party name.
 * Resolves contactId via the provided lookup first; falls back to
 * waitingOnLabel, then "someone".
 */
export function partyLabel(b: JobBlocker, contactName: (id: string) => string | undefined): string {
  if (b.waitingOnContactId != null) {
    const name = contactName(b.waitingOnContactId);
    if (name !== undefined) return name;
  }
  return b.waitingOnLabel ?? "someone";
}

/**
 * The oldest active blocker (callers pre-sort by raisedAt ascending).
 * Returns null when the list is empty.
 */
export function headline(active: JobBlocker[]): JobBlocker | null {
  return active[0] ?? null;
}

/**
 * Summary chip for an active-blocker banner.
 * Returns null when there are no active blockers.
 */
export function externalBlockerChip(
  active: JobBlocker[],
  contactName: (id: string) => string | undefined,
  now: Date
): { text: string; tone: "blocked" } | null {
  const h = headline(active);
  if (h === null) return null;
  const days = blockerAgeDays(h, now);
  const party = partyLabel(h, contactName);
  return { text: `Waiting on ${party} · ${days}d`, tone: "blocked" };
}

/**
 * First active blocker that gates a specific phase.
 * Returns null when no such blocker exists.
 */
export function phaseGatingBlocker(active: JobBlocker[], phase: MilestoneStage): JobBlocker | null {
  return active.find((b) => b.gatedPhaseId === phase) ?? null;
}
