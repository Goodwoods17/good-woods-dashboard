import type { MilestoneStage } from "@shared/lib/types";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { CLIENT_PHASE_LABELS, businessWeekWindow } from "./clientPortal";
import type { PhaseTargetDates } from "./schedule";

/**
 * S20 — Kickoff expectation-setting artifact (issue #108).
 *
 * Pure derivation for the "here's your schedule + how/when we'll update you"
 * document generated at project start. The research-backed principle: set
 * realistic expectations at kickoff, then keep them (beats over-delivering).
 *
 * Honest-promise model (ADR 0020):
 *   - Mid-phases show a soft WEEK WINDOW, never the raw internal target day.
 *   - Install day is the ONE firm committed date — the client's anchor.
 *   - Buffer, internal targets, and fever never appear.
 *   - The update protocol promises only what the shop can always keep:
 *     phase-complete notification + same-day date-change contact.
 */

export type KickoffPhaseEntry = {
  phase: MilestoneStage;
  /** Client-friendly phase name (never shop jargon like "CNC"). */
  label: string;
  /** "Week of YYYY-MM-DD" for mid-phases with a target, ISO date for install,
   *  "To be scheduled" when no target exists. */
  window: string;
};

export type KickoffArtifactInput = {
  jobName: string;
  clientName: string | null;
  /** The firm committed install date (ISO). */
  installDate: string;
  /** Internal phase targets — fuzzed into soft week windows, never shown raw. */
  phaseTargetDates?: PhaseTargetDates | null;
  /** Optional URL to the live client portal (S18 share link). */
  portalUrl?: string | null;
};

export type KickoffArtifact = {
  subject: string;
  phaseLines: KickoffPhaseEntry[];
  /** The update commitments — what the shop explicitly promises the client. */
  updateProtocol: string[];
  /** One-liner portal URL line; null when no share link exists yet. */
  portalLine: string | null;
  /** Full plain-text body ready to paste into an email or print. */
  fullText: string;
};

/**
 * The standard update protocol committed to at kickoff. Two items always;
 * a third links to the portal when a share link exists.
 */
export const BASE_UPDATE_PROTOCOL: readonly string[] = [
  "You'll hear from us when each phase of your project is complete.",
  "If your install date ever changes, we'll contact you the same day.",
] as const;

const PORTAL_PROTOCOL_ITEM =
  "You can view your live schedule anytime at the link below.";

/**
 * Display string for a single phase in the kickoff artifact.
 *
 * Install → the one firm ISO date.
 * Mid-phase with a target → "Week of YYYY-MM-DD" (Monday of that week).
 * Mid-phase without a target → "To be scheduled".
 */
export function kickoffPhaseWindow(
  phase: MilestoneStage,
  installDate: string,
  phaseTargetDates?: PhaseTargetDates | null
): string {
  if (phase === "install") return installDate;
  const target = phaseTargetDates?.[phase];
  if (!target) return "To be scheduled";
  const { start } = businessWeekWindow(target);
  return `Week of ${start}`;
}

/**
 * Assemble the full kickoff artifact from job data. Pure — no I/O.
 *
 * The artifact is a structured document that:
 *   1. Greets the client by name (if known).
 *   2. Shows the phase timeline with soft week windows.
 *   3. States the firm install date.
 *   4. Lists the update protocol (what the shop commits to proactively share).
 *   5. Optionally links to the live client portal.
 */
export function buildKickoffArtifact(input: KickoffArtifactInput): KickoffArtifact {
  const { jobName, clientName, installDate, phaseTargetDates, portalUrl } = input;

  const subject = `Your ${jobName} project schedule — Good Woods`;

  const phaseLines: KickoffPhaseEntry[] = MILESTONE_STAGES.map(({ key }) => ({
    phase: key,
    label: CLIENT_PHASE_LABELS[key],
    window: kickoffPhaseWindow(key, installDate, phaseTargetDates),
  }));

  const portalLine = portalUrl ? `Track your schedule anytime: ${portalUrl}` : null;

  const updateProtocol = portalUrl
    ? [...BASE_UPDATE_PROTOCOL, PORTAL_PROTOCOL_ITEM]
    : [...BASE_UPDATE_PROTOCOL];

  const greeting = clientName ? `Hi ${clientName},` : "Hi,";
  const phaseText = phaseLines.map((p) => `  ${p.label}: ${p.window}`).join("\n");
  const protocolText = updateProtocol.map((p) => `• ${p}`).join("\n");

  const fullText = [
    greeting,
    "",
    `Here's a snapshot of your ${jobName} schedule as we kick off.`,
    "",
    "Phase timeline:",
    phaseText,
    "",
    "How we'll keep you informed:",
    protocolText,
    ...(portalLine ? ["", portalLine] : []),
    "",
    "Questions? Reply to this email and we'll help.",
    "",
    "Good Woods · Spacecraft Joinery",
  ].join("\n");

  return { subject, phaseLines, updateProtocol, portalLine, fullText };
}
