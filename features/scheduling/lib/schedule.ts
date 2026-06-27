import type { Job, MilestoneStage } from "@shared/lib/types";

/**
 * Per-phase internal target dates. A partial map keyed by the six phases
 * (ADR 0008 milestone spine). Each value is an ISO date string (YYYY-MM-DD).
 * Additive to the Phase axis — distinct from `Job.installDate`, which stays the
 * FROZEN client-committed promise (the "dual schedule" / CCPM model, ADR 0020).
 */
export type PhaseTargetDates = Partial<Record<MilestoneStage, string>>;

/**
 * The basic on-track / behind badge for S1. Derived ONLY from the
 * current-milestone pointer vs. the CURRENT phase's internal target date:
 * you are "behind" once today is strictly past the date the current phase was
 * meant to be done by. Earlier phases are assumed complete (the pointer has
 * moved past them); later phases haven't started. With no target for the
 * current phase, nothing is overdue → "on_track".
 *
 * This is deliberately thin — the capacity-aware, buffer-burn and per-sub
 * reliability logic lands in later slices. Status stays unified into the
 * existing `health` axis (no second badge) once those slices wire it up.
 */
export type ScheduleStatus = "on_track" | "behind";

export function scheduleStatus(
  currentMilestone: MilestoneStage,
  phaseTargetDates: PhaseTargetDates | null | undefined,
  today: Date
): ScheduleStatus {
  const target = phaseTargetDates?.[currentMilestone];
  if (!target) return "on_track";
  // The target is owed by the END of its calendar day. Pin to UTC so the
  // result is timezone-independent (a date is a date, not an instant).
  const targetEndOfDay = new Date(`${target}T23:59:59.999Z`);
  return today.getTime() > targetEndOfDay.getTime() ? "behind" : "on_track";
}

/** The client-committed install date — the unchanged, frozen promise. */
export function committedDate(job: Job): string {
  return job.installDate;
}

/** The pooled buffer (days) between the internal target and the committed date. */
export function bufferDaysFor(job: Job): number {
  return job.bufferDays ?? 0;
}

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  on_track: "On track",
  behind: "Behind",
};
