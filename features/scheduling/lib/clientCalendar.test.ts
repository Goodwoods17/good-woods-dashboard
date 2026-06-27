import { describe, expect, it } from "vitest";
import { buildClientScheduleView } from "./clientPortal";
import { businessWeekWindow } from "./clientPortal";
import { buildClientCalendar } from "./clientCalendar";

// S21 (issue #109): a tokenized, subscribable ICS feed per client. The feed
// mirrors EXACTLY what the read-only portal shows (the honest-promise model):
// the ONE firm install day + the upcoming mid-phase WEEK RANGES — never the raw
// internal targets, the buffer, or the fever data. Stable per-token UIDs let a
// subscribed calendar auto-update an event in place when a date shifts.

const NOW = new Date("2026-06-01T12:00:00Z");
const TOKEN = "e2eschedontrack00000000000000000000ab";

function sampleView(overrides: Partial<Parameters<typeof buildClientScheduleView>[0]> = {}) {
  return buildClientScheduleView({
    currentMilestone: "cnc",
    installDate: "2026-12-15",
    committedDateSnapshot: "2026-12-15",
    phaseTargetDates: {
      assembly: "2026-08-12", // a mid-week internal target → fuzzed to a week range
      finishing: "2026-09-09",
      delivery: "2026-10-07",
    },
    ...overrides,
  });
}

function ics(overrides = {}) {
  return buildClientCalendar({
    jobName: "Job Status Demo",
    token: TOKEN,
    origin: "https://dash.goodwoods.test",
    view: sampleView(),
    now: NOW,
    ...overrides,
  });
}

describe("buildClientCalendar — VCALENDAR envelope", () => {
  it("wraps the feed in a valid VCALENDAR with VERSION + PRODID", () => {
    const out = ics();
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("END:VCALENDAR");
    expect(out).toContain("VERSION:2.0");
    expect(out).toMatch(/PRODID:.*Good Woods/);
  });

  it("uses CRLF line endings (RFC 5545)", () => {
    expect(ics()).toContain("\r\n");
    // No bare LF that is not preceded by CR.
    expect(/[^\r]\n/.test(ics())).toBe(false);
  });

  it("advertises a refresh interval so subscribers re-poll", () => {
    const out = ics();
    expect(out).toContain("X-PUBLISHED-TTL:");
    expect(out).toContain("REFRESH-INTERVAL;VALUE=DURATION:");
  });

  it("names the calendar after the job", () => {
    expect(ics()).toContain("X-WR-CALNAME:");
    expect(ics()).toContain("Job Status Demo");
  });
});

describe("buildClientCalendar — the firm install event", () => {
  it("emits an all-day VEVENT for the firm install day", () => {
    const out = ics();
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("DTSTART;VALUE=DATE:20261215");
    // All-day DTEND is exclusive → the following day.
    expect(out).toContain("DTEND;VALUE=DATE:20261216");
  });

  it("gives the install event a STABLE per-token UID so it updates in place", () => {
    expect(ics()).toContain(`UID:${TOKEN}-install@`);
  });

  it("stamps DTSTAMP from the supplied clock (deterministic)", () => {
    expect(ics()).toContain("DTSTAMP:20260601T120000Z");
  });

  it("links each event back to the portal via URL", () => {
    expect(ics()).toContain("URL:https://dash.goodwoods.test/s/" + TOKEN);
  });
});

describe("buildClientCalendar — mid-phase week-range events", () => {
  it("emits an all-day event for each upcoming mid-phase, fuzzed to its week window", () => {
    const out = ics();
    const win = businessWeekWindow("2026-08-12"); // Mon..Fri of the assembly target
    const start = win.start.replace(/-/g, "");
    const friPlusOne = new Date(`${win.end}T00:00:00Z`);
    friPlusOne.setUTCDate(friPlusOne.getUTCDate() + 1);
    const end = friPlusOne.toISOString().slice(0, 10).replace(/-/g, "");
    expect(out).toContain(`DTSTART;VALUE=DATE:${start}`);
    expect(out).toContain(`DTEND;VALUE=DATE:${end}`);
    expect(out).toContain(`UID:${TOKEN}-assembly@`);
  });
});

describe("buildClientCalendar — the privacy gate", () => {
  it("never leaks the RAW internal target date (only the fuzzed week)", () => {
    // The assembly internal target is 2026-08-12; only the Monday of its week
    // (2026-08-10) may appear. The exact day must never reach the client feed.
    expect(ics()).not.toContain("20260812");
  });

  it("omits completed phases and to-be-scheduled phases (no value to the client calendar)", () => {
    const out = ics();
    // design is complete (current phase is cnc) → no design event.
    expect(out).not.toContain(`UID:${TOKEN}-design@`);
    // cnc is the current phase with NO target → to-be-scheduled → no event.
    expect(out).not.toContain(`UID:${TOKEN}-cnc@`);
  });

  it("never contains shop-internal vocabulary", () => {
    const out = ics().toLowerCase();
    expect(out).not.toContain("buffer");
    expect(out).not.toContain("internal target");
    expect(out).not.toContain("fever");
  });
});

describe("buildClientCalendar — text escaping (RFC 5545)", () => {
  it("escapes commas and semicolons in the job name", () => {
    const out = ics({ jobName: "Smith, Kitchen; Phase 2" });
    expect(out).toContain("Smith\\, Kitchen\\; Phase 2");
  });
});
