import type { ClientScheduleView } from "./clientPortal";

/**
 * Pure ICS (RFC 5545) generation for the tokenized, subscribable CLIENT
 * calendar feed (S21, issue #109).
 *
 * The feed mirrors EXACTLY what the read-only portal shows (the honest-promise
 * model, ADR 0020): the ONE firm install day plus the upcoming mid-phase WEEK
 * RANGES. The raw internal targets, the buffer, and the fever data never appear
 * — this builder only consumes the already-client-safe `ClientScheduleView`, so
 * there is nothing private to leak here.
 *
 * Subscribable + auto-updating: each event carries a STABLE per-token UID
 * (`<token>-<phase>@…`). When a date shifts, the next refresh re-emits the same
 * UID with a new DTSTART, so the subscriber's calendar updates the event in
 * place rather than piling up duplicates. The portal stays the source of truth;
 * calendars refresh on their own schedule, so a committed-date change is always
 * paired with an immediate email (the feed lags by design).
 *
 * JSX-free + Supabase-free so it is unit-tested under the node vitest env and
 * imported by the server route handler that serves `text/calendar`.
 */

const UID_DOMAIN = "schedule.goodwoods.app";

/** How often a subscribing calendar should re-poll the feed (ISO 8601 duration). */
const REFRESH_INTERVAL = "PT6H";

export type ClientCalendarInput = {
  /** Friendly job name → calendar name + event summaries. */
  jobName: string;
  /** The share-link token; namespaces the per-event UIDs (capability identity). */
  token: string;
  /** The already-client-safe schedule view (firm install + fuzzed ranges). */
  view: ClientScheduleView;
  /** Absolute origin (e.g. https://dash…) → portal URL on each event. Optional. */
  origin?: string;
  /** Clock for DTSTAMP — injectable so tests are deterministic. */
  now?: Date;
};

/** Escape a text value per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** ISO date "2026-12-15" → ICS DATE value "20261215". */
function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** The day AFTER an ISO date, as an ICS DATE value (all-day DTEND is exclusive). */
function exclusiveEnd(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return toIcsDate(d.toISOString().slice(0, 10));
}

/** A Date → ICS UTC timestamp "YYYYMMDDTHHMMSSZ". */
function toIcsStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

type CalEvent = {
  uid: string;
  /** ICS DATE (all-day) start. */
  start: string;
  /** ICS DATE (all-day) exclusive end. */
  end: string;
  summary: string;
};

/**
 * Derive the client-safe events from the view. Only the firm install day and
 * upcoming/current mid-phase week RANGES become events; completed phases and
 * to-be-scheduled (no-target) phases are intentionally skipped — they add no
 * value to a subscriber's calendar and the range fuzz is what keeps the raw
 * internal target off the feed.
 */
function eventsFromView(input: ClientCalendarInput): CalEvent[] {
  const { token, jobName, view } = input;
  const events: CalEvent[] = [];

  for (const phase of view.phases) {
    const { display } = phase;
    if (display.kind === "firm") {
      events.push({
        uid: `${token}-${phase.phase}@${UID_DOMAIN}`,
        start: toIcsDate(display.date),
        end: exclusiveEnd(display.date),
        summary: `Good Woods install: ${jobName}`,
      });
    } else if (display.kind === "range") {
      events.push({
        uid: `${token}-${phase.phase}@${UID_DOMAIN}`,
        start: toIcsDate(display.start),
        end: exclusiveEnd(display.end),
        summary: `Good Woods: ${phase.label}`,
      });
    }
    // "complete" and "tbd" → no event (deliberate).
  }

  return events;
}

/**
 * Build the full ICS feed string for one tokenized client link. CRLF-delimited
 * per RFC 5545; the returned string is ready to serve as `text/calendar`.
 */
export function buildClientCalendar(input: ClientCalendarInput): string {
  const now = input.now ?? new Date();
  const stamp = toIcsStamp(now);
  const calName = `Good Woods: ${input.jobName}`;
  const portalUrl = input.origin ? `${input.origin}/s/${input.token}` : null;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Good Woods//Client Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    `NAME:${escapeText(calName)}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
  ];

  for (const ev of eventsFromView(input)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ev.start}`,
      `DTEND;VALUE=DATE:${ev.end}`,
      `SUMMARY:${escapeText(ev.summary)}`
    );
    if (portalUrl) {
      lines.push(`URL:${portalUrl}`);
      lines.push(`DESCRIPTION:${escapeText(`View your full schedule: ${portalUrl}`)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}
