/**
 * S22 — Notifications (approval line + message budget + trust-preserving delay
 * flow + Contacts link), issue #110. Pure unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  requiresApproval,
  withinDailyBudget,
  isQuietHours,
  shouldDebounce,
  buildLogisticsReminder,
  buildScheduleNotification,
  DAILY_MESSAGE_CAP,
  QUIET_HOUR_START,
  QUIET_HOUR_END,
  type NotificationKind,
  type NotificationLogEntry,
} from "./notifications";

// ── requiresApproval ────────────────────────────────────────────────────────

describe("requiresApproval", () => {
  it("returns true for 'recommit' — moving the client's date needs approval", () => {
    expect(requiresApproval("recommit")).toBe(true);
  });

  it("returns true for 'date_change'", () => {
    expect(requiresApproval("date_change")).toBe(true);
  });

  it("returns true for 'client_nudge'", () => {
    expect(requiresApproval("client_nudge")).toBe(true);
  });

  it("returns true for 'kickoff'", () => {
    expect(requiresApproval("kickoff")).toBe(true);
  });

  it("returns false for 'logistics_reminder' — pure info, no ask", () => {
    expect(requiresApproval("logistics_reminder")).toBe(false);
  });
});

// ── withinDailyBudget ───────────────────────────────────────────────────────

describe("withinDailyBudget", () => {
  const clientId = "client-abc";
  // 2026-06-27 at 14:00 UTC
  const now = new Date("2026-06-27T14:00:00Z");

  it("returns true when no messages sent today", () => {
    expect(withinDailyBudget([], clientId, now)).toBe(true);
  });

  it(`returns true when only ${DAILY_MESSAGE_CAP - 1} approval messages sent today`, () => {
    const log: NotificationLogEntry[] = [
      { clientId, jobId: "job-1", kind: "recommit", sentAt: "2026-06-27T10:00:00Z" },
    ];
    expect(withinDailyBudget(log, clientId, now)).toBe(true);
  });

  it(`returns false when ${DAILY_MESSAGE_CAP} or more approval messages sent today`, () => {
    const log: NotificationLogEntry[] = [
      { clientId, jobId: "job-1", kind: "recommit", sentAt: "2026-06-27T10:00:00Z" },
      { clientId, jobId: "job-2", kind: "client_nudge", sentAt: "2026-06-27T11:00:00Z" },
    ];
    expect(withinDailyBudget(log, clientId, now)).toBe(false);
  });

  it("does not count logistics_reminder messages toward the cap", () => {
    const log: NotificationLogEntry[] = [
      { clientId, jobId: "job-1", kind: "logistics_reminder", sentAt: "2026-06-27T10:00:00Z" },
      { clientId, jobId: "job-1", kind: "logistics_reminder", sentAt: "2026-06-27T11:00:00Z" },
      { clientId, jobId: "job-1", kind: "logistics_reminder", sentAt: "2026-06-27T12:00:00Z" },
    ];
    // Three logistics reminders → cap still not reached for approval messages.
    expect(withinDailyBudget(log, clientId, now)).toBe(true);
  });

  it("only counts today's messages for this client (not yesterday's or other clients')", () => {
    const log: NotificationLogEntry[] = [
      // Yesterday — doesn't count.
      { clientId, jobId: "job-1", kind: "recommit", sentAt: "2026-06-26T10:00:00Z" },
      // Different client — doesn't count.
      { clientId: "other-client", jobId: "job-1", kind: "recommit", sentAt: "2026-06-27T10:00:00Z" },
    ];
    expect(withinDailyBudget(log, clientId, now)).toBe(true);
  });
});

// ── isQuietHours ────────────────────────────────────────────────────────────

describe("isQuietHours", () => {
  it(`returns true at ${QUIET_HOUR_START}:00 (start of quiet window)`, () => {
    const t = new Date(`2026-06-27T${QUIET_HOUR_START}:00:00Z`);
    expect(isQuietHours(t)).toBe(true);
  });

  it("returns true at 23:00 (well into quiet hours)", () => {
    expect(isQuietHours(new Date("2026-06-27T23:00:00Z"))).toBe(true);
  });

  it("returns true at 02:00 UTC (early morning)", () => {
    expect(isQuietHours(new Date("2026-06-27T02:00:00Z"))).toBe(true);
  });

  it(`returns false at ${QUIET_HOUR_END}:00 (first non-quiet hour)`, () => {
    const t = new Date(`2026-06-27T0${QUIET_HOUR_END}:00:00Z`);
    expect(isQuietHours(t)).toBe(false);
  });

  it("returns false at 14:00 (mid-afternoon — never quiet)", () => {
    expect(isQuietHours(new Date("2026-06-27T14:00:00Z"))).toBe(false);
  });
});

// ── shouldDebounce ──────────────────────────────────────────────────────────

describe("shouldDebounce", () => {
  const jobId = "job-xyz";
  const kind: NotificationKind = "client_nudge";
  const now = new Date("2026-06-27T14:00:00Z");
  const debounceMinutes = 30;

  it("returns false when no recent entry for this job + kind", () => {
    expect(shouldDebounce([], jobId, kind, debounceMinutes, now)).toBe(false);
  });

  it("returns true when a matching entry exists within the debounce window", () => {
    const log: NotificationLogEntry[] = [
      { clientId: "c", jobId, kind, sentAt: "2026-06-27T13:45:00Z" }, // 15 min ago
    ];
    expect(shouldDebounce(log, jobId, kind, debounceMinutes, now)).toBe(true);
  });

  it("returns false when the only matching entry is outside the window", () => {
    const log: NotificationLogEntry[] = [
      { clientId: "c", jobId, kind, sentAt: "2026-06-27T13:00:00Z" }, // 60 min ago
    ];
    expect(shouldDebounce(log, jobId, kind, debounceMinutes, now)).toBe(false);
  });

  it("does not debounce for a different job with the same kind", () => {
    const log: NotificationLogEntry[] = [
      { clientId: "c", jobId: "other-job", kind, sentAt: "2026-06-27T13:45:00Z" },
    ];
    expect(shouldDebounce(log, jobId, kind, debounceMinutes, now)).toBe(false);
  });

  it("does not debounce for the same job with a different kind", () => {
    const log: NotificationLogEntry[] = [
      { clientId: "c", jobId, kind: "recommit" as NotificationKind, sentAt: "2026-06-27T13:45:00Z" },
    ];
    expect(shouldDebounce(log, jobId, kind, debounceMinutes, now)).toBe(false);
  });
});

// ── buildLogisticsReminder ──────────────────────────────────────────────────

describe("buildLogisticsReminder", () => {
  it("returns a logistics_reminder payload that does not require approval", () => {
    const result = buildLogisticsReminder({
      jobName: "Raubyn Bathrooms",
      clientName: "Alice",
      arrivalDate: "Friday, Jan 10",
    });
    expect(result.kind).toBe("logistics_reminder");
    expect(result.requiresApproval).toBe(false);
  });

  it("includes the job name in the subject", () => {
    const result = buildLogisticsReminder({
      jobName: "Raubyn Bathrooms",
      clientName: "Alice",
      arrivalDate: "Friday, Jan 10",
    });
    expect(result.subject).toContain("Raubyn Bathrooms");
  });

  it("includes the arrival date in the body", () => {
    const result = buildLogisticsReminder({
      jobName: "Raubyn Bathrooms",
      clientName: "Alice",
      arrivalDate: "Friday, Jan 10",
    });
    expect(result.body).toContain("Friday, Jan 10");
    expect(result.body).toContain("Alice");
  });
});

// ── buildScheduleNotification (trust-preserving delay flow) ────────────────

describe("buildScheduleNotification", () => {
  it("builds a recommit notification that requires approval", () => {
    const result = buildScheduleNotification({
      kind: "recommit",
      jobName: "Smith Kitchen",
      clientName: "Bob Smith",
      subject: "Smith Kitchen — updated install date",
      body: "Hi Bob, we need to move your install...",
    });
    expect(result.kind).toBe("recommit");
    expect(result.requiresApproval).toBe(true);
    expect(result.subject).toBe("Smith Kitchen — updated install date");
  });

  it("builds a kickoff notification that requires approval", () => {
    const result = buildScheduleNotification({
      kind: "kickoff",
      jobName: "Smith Kitchen",
      clientName: "Bob Smith",
      subject: "Smith Kitchen — your project schedule",
      body: "Hi Bob, here is your schedule...",
    });
    expect(result.kind).toBe("kickoff");
    expect(result.requiresApproval).toBe(true);
  });

  it("trust-preserving: recommit body should be direct and concrete (no groveling)", () => {
    // The body passed in must be honest + direct. We don't enforce phrasing
    // here (that's draftRecommitEmail's job); we verify the notification carries
    // it through unchanged.
    const body = "I want to give you an honest, early heads-up on your install date.";
    const result = buildScheduleNotification({
      kind: "recommit",
      jobName: "Job",
      clientName: "Client",
      subject: "Job — updated install date",
      body,
    });
    expect(result.body).toBe(body);
  });
});
