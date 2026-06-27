import { describe, it, expect } from "vitest";
import {
  daysUntil,
  phaseTargetPaceStatus,
  phaseTargetLabel,
  phaseBottleneckAdvisory,
  type PaceStatus,
} from "./shopFloor";

// ── daysUntil ──────────────────────────────────────────────────────────────

describe("daysUntil", () => {
  const today = new Date("2026-07-01T12:00:00.000Z");

  it("returns 0 when the target is today", () => {
    expect(daysUntil("2026-07-01", today)).toBe(0);
  });

  it("returns a positive number when the target is in the future", () => {
    expect(daysUntil("2026-07-04", today)).toBe(3);
  });

  it("returns a negative number when the target is in the past", () => {
    expect(daysUntil("2026-06-29", today)).toBe(-2);
  });

  it("is stable across time zones: date is always UTC-anchored", () => {
    // 2026-07-02 is 1 day from 2026-07-01 regardless of local TZ
    expect(daysUntil("2026-07-02", new Date("2026-07-01T23:00:00.000Z"))).toBe(1);
  });
});

// ── phaseTargetPaceStatus ─────────────────────────────────────────────────

describe("phaseTargetPaceStatus", () => {
  const today = new Date("2026-07-01T12:00:00.000Z");

  it('returns "due_today" when the target is today', () => {
    expect(phaseTargetPaceStatus("2026-07-01", today)).toBe("due_today");
  });

  it('returns "on_pace" when the target is in the future', () => {
    expect(phaseTargetPaceStatus("2026-07-06", today)).toBe("on_pace");
  });

  it('returns "behind" when the target date has passed', () => {
    expect(phaseTargetPaceStatus("2026-06-28", today)).toBe("behind");
  });
});

// ── phaseTargetLabel ──────────────────────────────────────────────────────

describe("phaseTargetLabel", () => {
  it('includes the short weekday, "left", and "on pace" for a future target', () => {
    // 2026-07-06 is a Monday
    const today = new Date("2026-07-01T00:00:00.000Z"); // Wednesday
    const label = phaseTargetLabel("2026-07-06", today);
    expect(label).toContain("Mon");
    expect(label).toContain("left");
    expect(label).toContain("on pace");
  });

  it('includes "overdue" and "behind" for a past target', () => {
    const today = new Date("2026-07-01T00:00:00.000Z");
    const label = phaseTargetLabel("2026-06-29", today);
    expect(label).toContain("overdue");
    expect(label).toContain("behind");
  });

  it('labels a same-day target as "due today"', () => {
    const today = new Date("2026-07-01T00:00:00.000Z");
    const label = phaseTargetLabel("2026-07-01", today);
    expect(label).toContain("due today");
  });

  it("uses short weekday names (3 letters)", () => {
    // 2026-07-08 = Wednesday
    const today = new Date("2026-07-07T00:00:00.000Z"); // Tuesday
    const label = phaseTargetLabel("2026-07-08", today);
    expect(label).toContain("Wed");
  });

  it("counts 1d left correctly", () => {
    const today = new Date("2026-07-01T00:00:00.000Z");
    const label = phaseTargetLabel("2026-07-02", today);
    expect(label).toContain("1d left");
  });
});

// ── phaseBottleneckAdvisory ───────────────────────────────────────────────

describe("phaseBottleneckAdvisory", () => {
  it("returns a message when the phase is behind", () => {
    const msg = phaseBottleneckAdvisory("Henderson", "Assembly", "behind");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Henderson");
    expect(msg).toContain("Assembly");
  });

  it("returns null when the phase is on pace (nothing to warn about)", () => {
    expect(phaseBottleneckAdvisory("Henderson", "Assembly", "on_pace")).toBeNull();
  });

  it("returns null when the phase is due today (no WIP pileup concern)", () => {
    expect(phaseBottleneckAdvisory("Henderson", "Assembly", "due_today")).toBeNull();
  });

  it("mentions pileup / downstream impact when behind", () => {
    const msg = phaseBottleneckAdvisory("Henderson", "Assembly", "behind");
    // The advisory should explain the consequence, not just flag the delay.
    expect(msg).toMatch(/pileup|downstream|unblock/i);
  });
});
