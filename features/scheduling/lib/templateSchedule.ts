import type { Job, MilestoneStage } from "@shared/lib/types";
import { phaseTargetDatesFromDurations } from "./capacity";
import { computeRiskTieredBuffer, BASE_BUFFER_PCT } from "./committedDate";

/**
 * Per-template default phase durations (work days). Each job template type has
 * a distinct "shape": install-only jobs skip fabrication phases; spray-finishing
 * jobs are almost entirely one phase. A 0-day phase is effectively skipped — its
 * target date stays at the prior cursor position (no advancement).
 *
 * These are the "bones" of the job type, used to pre-fill a new job's internal
 * schedule before real labour history exists for that job. They feed directly into
 * `phaseTargetDatesFromDurations` from S2, which chains the phases (weekends
 * skipped) into an honest internal target timeline. S4 wires this into /jobs/new.
 */
export const TEMPLATE_PHASE_DURATIONS: Record<
  Job["template"],
  Record<MilestoneStage, number>
> = {
  /**
   * A full custom build: kitchen/multi-room. All six phases have meaningful work.
   * Design covers drawings + client sign-off; CNC/Cut is the Toolpath or table-saw
   * phase; Assembly builds the boxes; Finishing is spray + cure; Delivery/Install.
   */
  full_project: {
    design: 5,
    cnc: 3,
    assembly: 5,
    finishing: 3,
    delivery: 1,
    install: 2,
  },
  /**
   * Refacing: replaces doors + finish + hinges on existing boxes. No cutting or
   * assembly of new carcasses — CNC and Assembly are zero. Design is a short
   * measure-and-order phase; Finishing is the main work (spray). Delivery is zero
   * (doors go directly to the customer's kitchen); Install is a half-day.
   */
  refacing: {
    design: 2,
    cnc: 0,
    assembly: 0,
    finishing: 3,
    delivery: 0,
    install: 1,
  },
  /**
   * Spray finishing only: customer drops off raw doors, we spray, they collect.
   * Design/CNC/Assembly are zero (no fabrication); Finishing is the core. Delivery
   * and Install are zero — the customer handles their own install.
   */
  spray_finishing: {
    design: 1,
    cnc: 0,
    assembly: 0,
    finishing: 4,
    delivery: 0,
    install: 0,
  },
  /**
   * Install only: we install someone else's product. No fabrication at all.
   * Design/CNC/Assembly/Finishing are zero; Delivery (receive/stage) + Install.
   */
  install_only: {
    design: 0,
    cnc: 0,
    assembly: 0,
    finishing: 0,
    delivery: 1,
    install: 2,
  },
};

export type TemplateDraftSchedule = {
  /** Per-phase internal target dates (ISO YYYY-MM-DD), chained from startDate. */
  phaseTargetDates: Record<MilestoneStage, string>;
  /** Job-level internal finish: same date as the last non-zero-duration phase target. */
  internalTargetDate: string;
  /**
   * Base buffer (work days) between the internal target and the committed install
   * date. Sized to ceil(totalWorkDays × 15%) — the S3 base-buffer formula with no
   * sub or variance nudge (those require live capacity + session data). The owner
   * can override this later via `jobs.buffer_days`.
   */
  bufferDays: number;
};

/**
 * Draft a schedule for a new job from its Job template (ADR 0012). Uses
 * template-specific default phase durations — the "shape" of that job type
 * before real labour history is available for this specific job. The result is
 * written into the new job row on creation (S4, issue #92), so the schedule
 * timeline on the job detail page shows honest internal targets from day one.
 *
 * Pure + dependency-free. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in
 * prod). The dates chain in MILESTONE_STAGES order with weekends skipped (same
 * logic as `phaseTargetDatesFromDurations` from S2).
 */
export function draftScheduleFromTemplate(
  template: Job["template"],
  startDate: string
): TemplateDraftSchedule {
  const durations = TEMPLATE_PHASE_DURATIONS[template];
  const phaseTargetDates = phaseTargetDatesFromDurations(startDate, durations);

  const totalWorkDays = Object.values(durations).reduce((a, b) => a + b, 0);
  const { totalDays: bufferDays } = computeRiskTieredBuffer({
    totalInternalDays: totalWorkDays,
    subDependencyCount: 0,
    varianceNudgeDays: 0,
  });

  // The internal target is the last phase's target (install), matching the S3
  // `CapacityAwareSchedule.internalTargetDate` convention.
  const internalTargetDate = phaseTargetDates.install;

  return { phaseTargetDates, internalTargetDate, bufferDays };
}

/** Human-readable labels for the four job template types. */
export const TEMPLATE_LABELS: Record<Job["template"], string> = {
  full_project: "Full Project",
  refacing: "Refacing",
  spray_finishing: "Spray Finishing",
  install_only: "Install Only",
};

/**
 * Total active work days in a template's default schedule (sum of all phase
 * durations). Used to size the buffer and to display an estimated project length.
 */
export function templateTotalWorkDays(template: Job["template"]): number {
  return Object.values(TEMPLATE_PHASE_DURATIONS[template]).reduce((a, b) => a + b, 0);
}

// Re-export for callers who need the buffer percentage for display.
export { BASE_BUFFER_PCT };
