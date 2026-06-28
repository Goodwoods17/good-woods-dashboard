import { type Job } from "@shared/lib/types";
import { scheduleStatus, type ScheduleStatus } from "./schedule";
import { PHASE_LIST, phaseIndex } from "./phases";

/**
 * Consolidated schedule overview data for ScheduleTab and ScheduleHealthWidget.
 * Pure function — no side-effects, no I/O. Safe to call in both server and client
 * contexts; rely on the feature flag in the rendering layer, not here.
 */
export type ScheduleOverview = {
  /** Current on-track / behind status derived from the current-phase target. */
  status: ScheduleStatus;
  /** The frozen client-committed install date (jobs.install_date). */
  committedInstall: string;
  /** The job-level internal finish target; null if not yet set. */
  internalTarget: string | null;
  /** Pooled buffer days between the internal target and the committed date. */
  bufferDays: number;
  /** How many phases precede the current milestone (= phases considered complete). */
  phasesComplete: number;
  /** Always 6 (the fixed phase spine, ADR 0008). */
  phasesTotal: number;
};

export function buildScheduleOverview(job: Job, today: Date): ScheduleOverview {
  const status = scheduleStatus(job.currentMilestone, job.phaseTargetDates, today);
  const currentIdx = phaseIndex(job.currentMilestone);
  return {
    status,
    committedInstall: job.installDate,
    internalTarget: job.internalTargetDate ?? null,
    bufferDays: job.bufferDays ?? 0,
    // Phases before the current one are assumed complete (the phase pointer has moved past them).
    phasesComplete: Math.max(0, currentIdx),
    phasesTotal: PHASE_LIST.length,
  };
}
