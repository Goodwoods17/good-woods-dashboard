import type { MilestoneStage } from "@shared/lib/types";
import { MILESTONE_STAGES } from "@shared/lib/types";
import type { PhaseTargetDates } from "./schedule";

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

export const CLIENT_STATUS_LABELS: Record<ClientScheduleStatus, string> = {
  on_track: "On track",
  date_updated: "Date updated",
};

/**
 * Client-friendly phase names. Deliberately hide shop jargon ("CNC / Cut")
 * behind plain language a homeowner reads at a glance.
 */
export const CLIENT_PHASE_LABELS: Record<MilestoneStage, string> = {
  design: "Design & drawings",
  cnc: "Cutting & machining",
  assembly: "Cabinet assembly",
  finishing: "Finishing",
  delivery: "Delivery",
  install: "Installation",
};

const PHASE_KEYS = MILESTONE_STAGES.map((s) => s.key);

function milestoneIndex(stage: MilestoneStage): number {
  return PHASE_KEYS.indexOf(stage);
}

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
  const idx = milestoneIndex(currentMilestone);
  return Math.round((idx / PHASE_KEYS.length) * 100);
}

/** The next concrete step for the client — the upcoming phase, friendly named. */
export function clientNextStepLabel(currentMilestone: MilestoneStage): string {
  const idx = milestoneIndex(currentMilestone);
  const next = PHASE_KEYS[idx + 1];
  if (!next) return `${CLIENT_PHASE_LABELS.install} — final step`;
  return CLIENT_PHASE_LABELS[next];
}

/**
 * The Mon–Fri work-week window containing an ISO date. Used to present a
 * mid-phase as a soft RANGE rather than the precise internal target day — the
 * client gets a sense of timing without the shop over-committing to a date.
 */
export function businessWeekWindow(iso: string): { start: string; end: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return { start: toIsoDate(monday), end: toIsoDate(friday) };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
};

/**
 * Assemble the full client-safe schedule view. The install phase is FIRM (exact
 * live committed date); completed phases read "complete"; upcoming/current
 * mid-phases with an internal target are fuzzed into a week RANGE; mid-phases
 * with no target read "to be scheduled". Buffer / internal targets / fever never
 * appear in the output.
 */
export function buildClientScheduleView(input: ClientScheduleInput): ClientScheduleView {
  const currentIdx = milestoneIndex(input.currentMilestone);

  const phases: ClientPhaseEntry[] = MILESTONE_STAGES.map(({ key }, idx) => {
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
  };
}
