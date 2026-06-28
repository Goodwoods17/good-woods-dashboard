import { MILESTONE_STAGES, type MilestoneStage } from "@shared/lib/types";

/**
 * The scheduling PHASE-AXIS facade — the single source of truth for the six
 * `MilestoneStage` phases (design → cnc → assembly → finishing → delivery →
 * install) as they're used across the Scheduling & Client-Commitment Engine.
 *
 * Those six phases are deliberately one axis with three jobs (ADR 0020 /
 * docs/domain.md): the ordinal job-progress spine, the shop's capacity
 * work-centers, AND the client-facing stepper. Before this module their key
 * list, labels, and default durations were re-derived from `MILESTONE_STAGES`
 * in ~11 lib files; consolidating them here keeps the order, the shop-facing
 * labels, the client-friendly labels, and the seed durations honest and in one
 * place. Pure — no React/Supabase — so it unit-tests under the node env and is
 * safe to import from server or client code. Ships behind
 * NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod), like the rest of the feature.
 */

/** The six phases, in their canonical milestone order. */
export const PHASE_LIST: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);

/** Position of a phase in the canonical order (-1 if not a known phase). */
export function phaseIndex(phase: MilestoneStage): number {
  return PHASE_LIST.indexOf(phase);
}

const INTERNAL_PHASE_LABELS: Record<MilestoneStage, string> = MILESTONE_STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s.label;
    return acc;
  },
  {} as Record<MilestoneStage, string>
);

/** The shop-facing label for a phase (e.g. "CNC / Cut"), from MILESTONE_STAGES. */
export function internalPhaseLabel(phase: MilestoneStage): string {
  return INTERNAL_PHASE_LABELS[phase] ?? phase;
}

/**
 * Client-friendly phase names. Deliberately hide shop jargon ("CNC / Cut")
 * behind plain language a homeowner reads at a glance. Moved here verbatim from
 * clientPortal.ts so the client stepper and the kickoff artifact share one map.
 */
export const CLIENT_PHASE_LABELS: Record<MilestoneStage, string> = {
  design: "Design & drawings",
  cnc: "Cutting & machining",
  assembly: "Cabinet assembly",
  finishing: "Finishing",
  delivery: "Delivery",
  install: "Installation",
};

/** The client-friendly label for a phase (hides the "CNC" shop term). */
export function clientPhaseLabel(phase: MilestoneStage): string {
  return CLIENT_PHASE_LABELS[phase];
}

/**
 * Fallback phase durations (work days) for a brand-new job before any history
 * exists. Replaced phase-by-phase by `seedPhaseDurationsFromHistory` (capacity.ts)
 * as soon as the shop has logged real time for that phase. Moved here verbatim
 * from capacity.ts so the Gantt pull-plan and the timeline read one set.
 */
export const DEFAULT_PHASE_DURATION_DAYS: Record<MilestoneStage, number> = {
  design: 5,
  cnc: 3,
  assembly: 5,
  finishing: 3,
  delivery: 1,
  install: 2,
};

/** The default work-day duration for a phase (pre-history fallback). */
export function defaultPhaseDurationDays(phase: MilestoneStage): number {
  return DEFAULT_PHASE_DURATION_DAYS[phase];
}
