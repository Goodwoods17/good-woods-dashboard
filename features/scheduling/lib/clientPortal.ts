import type { MilestoneStage } from "@shared/lib/types";
import { businessWeekWindow } from "@shared/lib/workdays";
import { PHASE_LIST, phaseIndex, CLIENT_PHASE_LABELS } from "./phases";
import type { PhaseTargetDates } from "./schedule";

// Re-export so existing importers (kickoffArtifact, tests) keep resolving
// businessWeekWindow from clientPortal; the canonical definition lives in
// @shared/lib/workdays.
export { businessWeekWindow };

/**
 * Pure derivation for the read-only CLIENT schedule portal (S18, issue #106).
 *
 * The honest-promise model (ADR 0020): a client never sees the buffer, the
 * internal targets, or the fever chart. They see a friendly milestone stepper,
 * a % done, the next step, a soft RANGE for each mid-phase, and ONE firm install
 * day — the frozen client-committed promise. The only status they ever see is
 * "On track" — it flips to "Date updated" exclusively when the firm install date
 * has actually moved away from the date promised when the link was minted.
 *
 * Everything here is JSX-free + Supabase-free so the client-facing logic is unit
 * tested under the node vitest env. The public page computes this view
 * server-side and passes only the safe result to the browser, so the raw
 * internal targets never serialize to the client.
 */

export type ClientScheduleStatus = "on_track" | "date_updated";

/**
 * A single client-facing action item derived from the job's blocker text
 * (S19, issue #107). The shop controls what reaches the portal by what they
 * write in the free-text blocker field.
 */
export type ClientActionItem = {
  text: string;
};

/**
 * The single upcoming next milestone and its optional soft week window (S19).
 * Used to drive the "What's next" nudge card on the client portal — one clear
 * answer to "what happens after the current phase?".
 */
export type ClientNextMilestoneNudge = {
  label: string;
  /** Mon–Fri week window when an internal target exists; null = to be scheduled. */
  window: { start: string; end: string } | null;
};

export const CLIENT_STATUS_LABELS: Record<ClientScheduleStatus, string> = {
  on_track: "On track",
  date_updated: "Date updated",
};

/**
 * The ONLY status a client ever sees. On track unless the live committed install
 * date has diverged from the date promised when the link was minted (the
 * snapshot). Any movement — earlier or later — surfaces as "Date updated" so the
 * firm promise never silently changes under the client.
 */
export function clientScheduleStatus(
  liveCommittedDate: string,
  committedDateSnapshot: string
): ClientScheduleStatus {
  return liveCommittedDate === committedDateSnapshot ? "on_track" : "date_updated";
}

/**
 * Progress as completed-phase share of the six-phase journey. The current phase
 * is in-flight (not counted complete), so reaching install reads 83% — leaving
 * honest headroom for the install itself rather than implying "done".
 */
export function clientPercentDone(currentMilestone: MilestoneStage): number {
  const idx = phaseIndex(currentMilestone);
  return Math.round((idx / PHASE_LIST.length) * 100);
}

/** The next concrete step for the client — the upcoming phase, friendly named. */
export function clientNextStepLabel(currentMilestone: MilestoneStage): string {
  const idx = phaseIndex(currentMilestone);
  const next = PHASE_LIST[idx + 1];
  if (!next) return `${CLIENT_PHASE_LABELS.install} — final step`;
  return CLIENT_PHASE_LABELS[next];
}

/**
 * Derive the "What's next" nudge: the single upcoming milestone + its soft
 * week window (S19, issue #107). Returns null when the job is already at the
 * install phase (nothing further to show). The window is null when no internal
 * target exists for the upcoming phase — the client sees "to be scheduled".
 */
export function clientNextMilestoneNudge(
  currentMilestone: MilestoneStage,
  phaseTargetDates?: Partial<Record<MilestoneStage, string>> | null
): ClientNextMilestoneNudge | null {
  const idx = phaseIndex(currentMilestone);
  const nextKey = PHASE_LIST[idx + 1] as MilestoneStage | undefined;
  if (!nextKey) return null;
  const target = phaseTargetDates?.[nextKey];
  return {
    label: CLIENT_PHASE_LABELS[nextKey],
    window: target ? businessWeekWindow(target) : null,
  };
}

/**
 * Extract client-facing action items from the job's blocker text (S19).
 * The shop writes the blocker; what they write is what the client sees.
 * Returns an empty array when there is nothing outstanding.
 */
export function buildClientActionItems(blocker: string | null | undefined): ClientActionItem[] {
  const trimmed = blocker?.trim();
  if (!trimmed) return [];
  return [{ text: trimmed }];
}

export type ClientPhaseState = "done" | "current" | "upcoming";

export type ClientPhaseDisplay =
  | { kind: "complete" }
  | { kind: "firm"; date: string }
  | { kind: "range"; start: string; end: string }
  | { kind: "tbd" };

export type ClientPhaseEntry = {
  phase: MilestoneStage;
  label: string;
  state: ClientPhaseState;
  display: ClientPhaseDisplay;
};

export type ClientScheduleInput = {
  currentMilestone: MilestoneStage;
  /** The live committed install date (firm; the frozen client promise). */
  installDate: string;
  /** The install date as it stood when this share link was minted. */
  committedDateSnapshot: string;
  /** INTERNAL per-phase targets — only ever fuzzed into ranges, never shown raw. */
  phaseTargetDates?: PhaseTargetDates | null;
  /**
   * S19 (issue #107): free-text blocker written by the shop. Surfaced as
   * "What we need from you" on the client portal. The shop controls what reaches
   * the portal by what they write here — this is intentionally direct.
   */
  blocker?: string | null;
};

export type ClientScheduleView = {
  status: ClientScheduleStatus;
  statusLabel: string;
  percentDone: number;
  currentLabel: string;
  nextStepLabel: string;
  /** The firm committed install day (always the LIVE date — the honest promise). */
  committedInstall: string;
  phases: ClientPhaseEntry[];
  /** S19: the single next milestone + its soft window (null at install). */
  nextMilestoneNudge: ClientNextMilestoneNudge | null;
  /** S19: outstanding items the client needs to act on (from the blocker field). */
  clientActions: ClientActionItem[];
};

/**
 * Assemble the full client-safe schedule view. The install phase is FIRM (exact
 * live committed date); completed phases read "complete"; upcoming/current
 * mid-phases with an internal target are fuzzed into a week RANGE; mid-phases
 * with no target read "to be scheduled". Buffer / internal targets / fever never
 * appear in the output.
 */
export function buildClientScheduleView(input: ClientScheduleInput): ClientScheduleView {
  const currentIdx = phaseIndex(input.currentMilestone);

  const phases: ClientPhaseEntry[] = PHASE_LIST.map((key, idx) => {
    const state: ClientPhaseState =
      idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";

    let display: ClientPhaseDisplay;
    if (key === "install") {
      // The one firm promise — exact live committed date, even when "done".
      display = { kind: "firm", date: input.installDate };
    } else if (state === "done") {
      display = { kind: "complete" };
    } else {
      const target = input.phaseTargetDates?.[key];
      display = target ? { kind: "range", ...businessWeekWindow(target) } : { kind: "tbd" };
    }

    return { phase: key, label: CLIENT_PHASE_LABELS[key], state, display };
  });

  const status = clientScheduleStatus(input.installDate, input.committedDateSnapshot);

  return {
    status,
    statusLabel: CLIENT_STATUS_LABELS[status],
    percentDone: clientPercentDone(input.currentMilestone),
    currentLabel: CLIENT_PHASE_LABELS[input.currentMilestone],
    nextStepLabel: clientNextStepLabel(input.currentMilestone),
    committedInstall: input.installDate,
    phases,
    nextMilestoneNudge: clientNextMilestoneNudge(input.currentMilestone, input.phaseTargetDates),
    clientActions: buildClientActionItems(input.blocker),
  };
}
