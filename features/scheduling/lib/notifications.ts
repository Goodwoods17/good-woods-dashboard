/**
 * S22 — Notifications (approval line + message budget + trust-preserving delay
 * flow + Contacts link), issue #110. Pure — no React, no Supabase, no Resend.
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Approval line: anything that involves dates or asks the client for something
 * (re-commit, date change, what's-next nudge, kickoff) requires an explicit
 * owner click before it goes out. Pure logistics reminders ('we arrive tomorrow')
 * are the only auto-send path.
 *
 * Message budget: per-client/day cap on approval-required messages, quiet-hour
 * suppression, and ripple debounce so a multi-phase ripple emits one digest not
 * six rapid-fire emails.
 *
 * Trust-preserving delay flow: the recommit email (drafted by draftRecommitEmail
 * in recommit.ts) must be early, honest, and concrete. This module surfaces it
 * for approval — the owner reads, edits if needed, then clicks Send.
 */

// ── Kind taxonomy ────────────────────────────────────────────────────────────

/**
 * What type of message this is. Drives the approval gate and the digest logic.
 *
 * - `recommit`           — The committed date is moving. Requires approval.
 *                         Drafts from draftRecommitEmail (recommit.ts).
 * - `date_change`        — Initial committed date set / updated (not a slip).
 *                         Requires approval.
 * - `client_nudge`       — "What's next / what we need from you" proactive touch.
 *                         Requires approval (it asks the client for something).
 * - `kickoff`            — Project-start expectation-setting artifact.
 *                         Requires approval (it describes the schedule + protocol).
 * - `logistics_reminder` — Pure logistics info: "we arrive tomorrow", "keys needed".
 *                         Auto-send only. Never counts toward the daily cap.
 */
export type NotificationKind =
  | "recommit"
  | "date_change"
  | "client_nudge"
  | "kickoff"
  | "logistics_reminder";

/**
 * Whether this kind of notification must be explicitly approved by the owner
 * before it reaches the client. Only pure logistics info is auto-send.
 */
export function requiresApproval(kind: NotificationKind): boolean {
  return kind !== "logistics_reminder";
}

// ── Message budget ───────────────────────────────────────────────────────────

/**
 * Maximum number of approval-required messages per client per calendar day (UTC).
 * Logistics reminders are exempt from this cap.
 */
export const DAILY_MESSAGE_CAP = 2;

/** Quiet-hours window: 9pm–7am UTC. Suppress auto-send + surface a warning for
 *  approval-required sends initiated in this window. */
export const QUIET_HOUR_START = 21; // 21:00 UTC
export const QUIET_HOUR_END = 7; // 07:00 UTC (exclusive)

/**
 * A lightweight log entry — one per sent notification. Loaded from
 * `scheduling_notifications` (status = 'sent' | 'auto_sent') for the budget
 * and debounce checks.
 */
export type NotificationLogEntry = {
  clientId: string;
  jobId: string;
  kind: NotificationKind;
  /** ISO timestamp the email was actually delivered. */
  sentAt: string;
};

/**
 * Whether the shop can send another approval-required message to this client
 * today without exceeding the per-client/day cap.
 * Logistics reminders are always within budget (they don't count toward the cap).
 */
export function withinDailyBudget(
  log: NotificationLogEntry[],
  clientId: string,
  now: Date
): boolean {
  const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
  const sentToday = log.filter(
    (e) =>
      e.clientId === clientId && requiresApproval(e.kind) && e.sentAt.slice(0, 10) === todayStr
  );
  return sentToday.length < DAILY_MESSAGE_CAP;
}

/**
 * Whether the current UTC time falls inside the quiet window (9pm–7am).
 * Used to surface a warning when the owner tries to send a logistics reminder
 * automatically outside business hours, and to defer auto-sends accordingly.
 */
export function isQuietHours(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

/**
 * Whether a matching notification for the same job + kind was already sent
 * within the debounce window (e.g. a ripple cascade that touches the same
 * client multiple times in quick succession). Returns true = skip / batch.
 */
export function shouldDebounce(
  log: NotificationLogEntry[],
  jobId: string,
  kind: NotificationKind,
  windowMinutes: number,
  now: Date
): boolean {
  const windowMs = windowMinutes * 60 * 1000;
  return log.some(
    (e) =>
      e.jobId === jobId &&
      e.kind === kind &&
      now.getTime() - new Date(e.sentAt).getTime() < windowMs
  );
}

// ── Notification payload ─────────────────────────────────────────────────────

/** The composed notification ready for the queue or the Resend API. */
export type NotificationPayload = {
  kind: NotificationKind;
  /** True = must wait for owner click before sending. False = auto-send path. */
  requiresApproval: boolean;
  subject: string;
  body: string;
};

/**
 * Build a logistics reminder ('we arrive tomorrow'). Auto-send eligible, never
 * counts toward the per-client/day cap. Concrete and factual — no theatrics.
 */
export function buildLogisticsReminder(params: {
  jobName: string;
  clientName: string;
  arrivalDate: string;
}): NotificationPayload {
  const { jobName, clientName, arrivalDate } = params;
  return {
    kind: "logistics_reminder",
    requiresApproval: false,
    subject: `${jobName} — we arrive ${arrivalDate}`,
    body: [
      `Hi ${clientName},`,
      ``,
      `Just a heads-up: our crew arrives for your install on ${arrivalDate}.`,
      `Please make sure the space is ready and accessible.`,
      ``,
      `Best,`,
      `Good Woods`,
    ].join("\n"),
  };
}

/**
 * Build any notification payload from a pre-composed subject + body (e.g. from
 * draftRecommitEmail, buildKickoffArtifact). This is the thin wrapper that
 * attaches the approval flag and routes the payload into the queue.
 *
 * The body must already follow the trust-preserving tone (see recommit.ts for
 * the delay-flow: early, honest, concrete — no groveling).
 */
export function buildScheduleNotification(params: {
  kind: NotificationKind;
  jobName: string;
  clientName: string;
  subject: string;
  body: string;
}): NotificationPayload {
  const { kind, subject, body } = params;
  return {
    kind,
    requiresApproval: requiresApproval(kind),
    subject,
    body,
  };
}

// ── Budget advisory ──────────────────────────────────────────────────────────

/**
 * Human-readable reason why a notification is being held back (for the UI).
 * Returns null when there's no hold.
 */
export type HoldReason = "quiet_hours" | "daily_cap_reached" | "debounced" | null;

export function computeHoldReason(params: {
  kind: NotificationKind;
  log: NotificationLogEntry[];
  clientId: string;
  jobId: string;
  debounceMinutes: number;
  now: Date;
}): HoldReason {
  const { kind, log, clientId, jobId, debounceMinutes, now } = params;

  // Logistics reminders: only check quiet hours + debounce (not daily cap).
  if (!requiresApproval(kind)) {
    if (isQuietHours(now)) return "quiet_hours";
    if (shouldDebounce(log, jobId, kind, debounceMinutes, now)) return "debounced";
    return null;
  }

  // Approval-required: check all three gates.
  if (!withinDailyBudget(log, clientId, now)) return "daily_cap_reached";
  if (isQuietHours(now)) return "quiet_hours";
  if (shouldDebounce(log, jobId, kind, debounceMinutes, now)) return "debounced";
  return null;
}

export const HOLD_REASON_LABELS: Record<NonNullable<HoldReason>, string> = {
  quiet_hours: "Quiet hours (9pm–7am) — scheduled for morning",
  daily_cap_reached: "Daily message cap reached — will send tomorrow",
  debounced: "Batching with other updates — will send shortly",
};
