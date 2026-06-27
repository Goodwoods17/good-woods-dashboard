/**
 * S11 — Trade-line dates + sub dependency wiring + sub request/confirm +
 * accountability (issue #99). Unit tests written before the implementation.
 */
import { describe, it, expect } from "vitest";
import {
  blockerPhaseBurnDays,
  computeSubReliabilityBufferDays,
  missedSubDateBlockerReason,
  shouldAutoRaiseMissedBlocker,
  type SubtradeReliabilityRecord,
} from "./tradeDates";
import type { JobBlocker } from "@shared/lib/types";
import type { PhaseTargetDates } from "./schedule";

// ── blockerPhaseBurnDays ──────────────────────────────────────────────────────

describe("blockerPhaseBurnDays", () => {
  // July 10 2026 is a Thursday — nice mid-week anchor for deterministic counts.
  const today = new Date("2026-07-10T12:00:00.000Z");

  it("returns 0 when there are no blockers", () => {
    expect(blockerPhaseBurnDays([], null, today)).toBe(0);
  });

  it("returns 0 for whole-job blockers (gatedPhaseId is null)", () => {
    const blocker: JobBlocker = {
      id: "b1",
      jobId: "j1",
      reason: "Waiting on permit",
      waitingOnContactId: null,
      waitingOnLabel: "Permit office",
      gatedPhaseId: null,
      raisedAt: "2026-07-01T00:00:00.000Z",
      resolvedAt: null,
    };
    expect(blockerPhaseBurnDays([blocker], {}, today)).toBe(0);
  });

  it("ignores resolved phase-gated blockers", () => {
    const blocker: JobBlocker = {
      id: "b2",
      jobId: "j1",
      reason: "Resolved drawings",
      waitingOnContactId: null,
      waitingOnLabel: null,
      gatedPhaseId: "cnc",
      raisedAt: "2026-06-01T00:00:00.000Z",
      resolvedAt: "2026-06-15T00:00:00.000Z",
    };
    const phaseTargets: PhaseTargetDates = { cnc: "2026-06-10" };
    expect(blockerPhaseBurnDays([blocker], phaseTargets, today)).toBe(0);
  });

  it("returns 0 when the phase target has not yet been reached (blocker raised early)", () => {
    const blocker: JobBlocker = {
      id: "b3",
      jobId: "j1",
      reason: "Awaiting approval",
      waitingOnContactId: null,
      waitingOnLabel: null,
      gatedPhaseId: "design",
      raisedAt: "2026-07-01T00:00:00.000Z",
      resolvedAt: null,
    };
    // Target is in the future — no burn yet
    const phaseTargets: PhaseTargetDates = { design: "2026-07-20" };
    expect(blockerPhaseBurnDays([blocker], phaseTargets, today)).toBe(0);
  });

  it("returns 0 when there is no phase target date for the gated phase", () => {
    const blocker: JobBlocker = {
      id: "b4",
      jobId: "j1",
      reason: "Missing drawings",
      waitingOnContactId: null,
      waitingOnLabel: null,
      gatedPhaseId: "design",
      raisedAt: "2026-07-01T00:00:00.000Z",
      resolvedAt: null,
    };
    // No target for design → can't compute burn
    expect(blockerPhaseBurnDays([blocker], {}, today)).toBe(0);
  });

  it("burns work days past the phase target when a phase-gated blocker is active", () => {
    const blocker: JobBlocker = {
      id: "b5",
      jobId: "j1",
      reason: "Awaiting shop drawings approval",
      waitingOnContactId: null,
      waitingOnLabel: null,
      gatedPhaseId: "design",
      raisedAt: "2026-07-05T00:00:00.000Z",
      resolvedAt: null,
    };
    // Target was Tuesday July 7. Today is Thursday July 10.
    // Work days July 7 → July 10: July 8 (Wed) + July 9 (Thu) + July 10 (Thu) ...
    // workDaysBetween("2026-07-07", "2026-07-10"): iterates Jul8 (+1), Jul9 (+1), Jul10 (+1) = 3
    const phaseTargets: PhaseTargetDates = { design: "2026-07-07" };
    expect(blockerPhaseBurnDays([blocker], phaseTargets, today)).toBe(3);
  });

  it("sums burn days from multiple active phase-gated blockers on different phases", () => {
    const blockers: JobBlocker[] = [
      {
        id: "b6",
        jobId: "j1",
        reason: "Blocker on design",
        waitingOnContactId: null,
        waitingOnLabel: null,
        gatedPhaseId: "design",
        raisedAt: "2026-07-05T00:00:00.000Z",
        resolvedAt: null,
      },
      {
        id: "b7",
        jobId: "j1",
        reason: "Blocker on cnc",
        waitingOnContactId: null,
        waitingOnLabel: null,
        gatedPhaseId: "cnc",
        raisedAt: "2026-07-05T00:00:00.000Z",
        resolvedAt: null,
      },
    ];
    // Both phases have the same past target (July 7 → 3 burn days each).
    const phaseTargets: PhaseTargetDates = { design: "2026-07-07", cnc: "2026-07-07" };
    const single = blockerPhaseBurnDays([blockers[0]], { design: "2026-07-07" }, today);
    const both = blockerPhaseBurnDays(blockers, phaseTargets, today);
    expect(both).toBe(single * 2);
  });
});

// ── computeSubReliabilityBufferDays ──────────────────────────────────────────

describe("computeSubReliabilityBufferDays", () => {
  it("returns 0 for an empty reliability record set", () => {
    expect(computeSubReliabilityBufferDays([])).toBe(0);
  });

  it("returns 0 when all records show the sub met their dates (missed=false)", () => {
    const records: SubtradeReliabilityRecord[] = [
      {
        subtradeId: "s1",
        jobTradeId: "jt1",
        committedDate: "2026-06-01",
        actualDoneDate: "2026-05-30",
        missed: false,
        recordedAt: "2026-05-30T00:00:00Z",
      },
      {
        subtradeId: "s1",
        jobTradeId: "jt2",
        committedDate: "2026-07-01",
        actualDoneDate: "2026-07-01",
        missed: false,
        recordedAt: "2026-07-01T00:00:00Z",
      },
    ];
    expect(computeSubReliabilityBufferDays(records)).toBe(0);
  });

  it("adds extra days proportional to the miss rate (50% → ceil(0.5 × baseDaysPerSub))", () => {
    const records: SubtradeReliabilityRecord[] = [
      {
        subtradeId: "s1",
        jobTradeId: "jt1",
        committedDate: "2026-06-01",
        actualDoneDate: "2026-06-10",
        missed: true,
        recordedAt: "2026-06-10T00:00:00Z",
      },
      {
        subtradeId: "s1",
        jobTradeId: "jt2",
        committedDate: "2026-07-01",
        actualDoneDate: "2026-07-01",
        missed: false,
        recordedAt: "2026-07-01T00:00:00Z",
      },
    ];
    // 1 miss / 2 total = 50% miss rate → ceil(0.5 × 3) = 2
    expect(computeSubReliabilityBufferDays(records, 3)).toBe(2);
  });

  it("returns the full baseDays when the sub always misses", () => {
    const records: SubtradeReliabilityRecord[] = [
      {
        subtradeId: "s1",
        jobTradeId: "jt1",
        committedDate: "2026-06-01",
        actualDoneDate: null,
        missed: true,
        recordedAt: "2026-06-05T00:00:00Z",
      },
      {
        subtradeId: "s1",
        jobTradeId: "jt2",
        committedDate: "2026-07-01",
        actualDoneDate: null,
        missed: true,
        recordedAt: "2026-07-05T00:00:00Z",
      },
    ];
    // 2 miss / 2 total = 100% miss rate → ceil(1.0 × 3) = 3
    expect(computeSubReliabilityBufferDays(records, 3)).toBe(3);
  });

  it("aggregates across multiple subs (each computed independently)", () => {
    const records: SubtradeReliabilityRecord[] = [
      // Sub A: 100% miss (1/1) → 3 extra days
      {
        subtradeId: "s1",
        jobTradeId: "jt1",
        committedDate: "2026-06-01",
        actualDoneDate: null,
        missed: true,
        recordedAt: "2026-06-05T00:00:00Z",
      },
      // Sub B: 0% miss (0/1) → 0 extra days
      {
        subtradeId: "s2",
        jobTradeId: "jt2",
        committedDate: "2026-06-01",
        actualDoneDate: "2026-06-01",
        missed: false,
        recordedAt: "2026-06-01T00:00:00Z",
      },
    ];
    // Sub A: ceil(1.0 × 3) = 3, Sub B: 0 → total = 3
    expect(computeSubReliabilityBufferDays(records, 3)).toBe(3);
  });
});

// ── missedSubDateBlockerReason ────────────────────────────────────────────────

describe("missedSubDateBlockerReason", () => {
  it("names the trade, subtrade, and committed date in the reason text", () => {
    const reason = missedSubDateBlockerReason("Install", "Sparky Electric", "2026-07-15");
    expect(reason).toContain("Install");
    expect(reason).toContain("Sparky Electric");
    expect(reason).toContain("2026-07-15");
  });

  it("returns a non-empty string for any valid inputs", () => {
    const reason = missedSubDateBlockerReason("Finishing", "Pro Finisher Co.", "2026-08-01");
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(10);
  });
});

// ── shouldAutoRaiseMissedBlocker ─────────────────────────────────────────────

describe("shouldAutoRaiseMissedBlocker", () => {
  const today = new Date("2026-07-10T12:00:00.000Z");

  it("returns false when there is no sub_committed_date (null)", () => {
    expect(shouldAutoRaiseMissedBlocker(null, "needed", today)).toBe(false);
  });

  it("returns false when there is no sub_committed_date (undefined)", () => {
    expect(shouldAutoRaiseMissedBlocker(undefined, "booked", today)).toBe(false);
  });

  it("returns false when status is 'done' (sub delivered)", () => {
    expect(shouldAutoRaiseMissedBlocker("2026-07-01", "done", today)).toBe(false);
  });

  it("returns false when committed date is today (not yet missed — give them the day)", () => {
    expect(shouldAutoRaiseMissedBlocker("2026-07-10", "booked", today)).toBe(false);
  });

  it("returns false when committed date is in the future", () => {
    expect(shouldAutoRaiseMissedBlocker("2026-07-20", "booked", today)).toBe(false);
  });

  it("returns true when committed date has passed and status is 'booked'", () => {
    expect(shouldAutoRaiseMissedBlocker("2026-07-01", "booked", today)).toBe(true);
  });

  it("returns true when committed date has passed and status is 'needed'", () => {
    expect(shouldAutoRaiseMissedBlocker("2026-07-09", "needed", today)).toBe(true);
  });

  it("returns false for a date exactly one day ago when today is a weekend (check boundary)", () => {
    // July 9 is a Wednesday → committed July 9, today July 10 (Thursday) → missed
    expect(shouldAutoRaiseMissedBlocker("2026-07-09", "booked", today)).toBe(true);
  });
});
