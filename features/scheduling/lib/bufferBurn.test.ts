import { describe, it, expect } from "vitest";
import {
  computeBufferBurn,
  chainCompletionPct,
  feverZone,
  computeRecoveryFlag,
  deriveHealthFromFever,
  DEFAULT_FEVER_THRESHOLDS,
  type FeverZone,
} from "./bufferBurn";
import type { JobBlocker } from "@shared/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockBlocker = (id = "b1"): JobBlocker => ({
  id,
  jobId: "job-1",
  reason: "Waiting on material",
  waitingOnContactId: null,
  waitingOnLabel: null,
  gatedPhaseId: null,
  raisedAt: "2026-06-01T09:00:00.000Z",
  resolvedAt: null,
});

// ─── computeBufferBurn ───────────────────────────────────────────────────────

describe("computeBufferBurn", () => {
  it("returns zero consumed when no buffer is allocated (internal = committed)", () => {
    const result = computeBufferBurn("2026-08-01", "2026-08-01", new Date("2026-07-01"));
    expect(result.totalBufferDays).toBe(0);
    expect(result.consumedBufferDays).toBe(0);
    expect(result.remainingBufferDays).toBe(0);
    expect(result.bufferConsumedPct).toBe(0);
  });

  it("returns zero consumed when today is before the internal target date", () => {
    // 10 buffer days between internal (Aug 1) and committed (Aug 14-ish work-day span).
    // Today is July — no buffer consumed.
    const result = computeBufferBurn("2026-08-01", "2026-08-14", new Date("2026-07-15"));
    expect(result.consumedBufferDays).toBe(0);
    expect(result.remainingBufferDays).toBe(result.totalBufferDays);
    expect(result.bufferConsumedPct).toBe(0);
  });

  it("returns zero consumed on the internal target date itself", () => {
    const result = computeBufferBurn("2026-08-03", "2026-08-17", new Date("2026-08-03"));
    expect(result.consumedBufferDays).toBe(0);
    expect(result.bufferConsumedPct).toBe(0);
  });

  it("returns positive consumed days when today has passed the internal target", () => {
    // internal = Mon Aug 3, today = Wed Aug 5 → 2 work days consumed
    const result = computeBufferBurn("2026-08-03", "2026-08-21", new Date("2026-08-05"));
    expect(result.consumedBufferDays).toBe(2);
    expect(result.bufferConsumedPct).toBeGreaterThan(0);
  });

  it("skips weekends when counting consumed buffer days", () => {
    // internal = Fri Aug 7, today = Mon Aug 10 → only 1 work day consumed
    const result = computeBufferBurn("2026-08-07", "2026-08-28", new Date("2026-08-10"));
    expect(result.consumedBufferDays).toBe(1);
  });

  it("correctly computes totalBufferDays as work days between internal and committed", () => {
    // Mon Aug 3 to Mon Aug 10 → 5 work days (Tue/Wed/Thu/Fri/Mon)
    const result = computeBufferBurn("2026-08-03", "2026-08-10", new Date("2026-07-01"));
    expect(result.totalBufferDays).toBe(5);
  });

  it("bufferConsumedPct reflects consumed/total correctly", () => {
    // 10 buffer work days, 5 consumed → 50%
    // Mon Aug 3 → Mon Aug 17 = 10 work days buffer
    // Today = Mon Aug 10 → 5 work days consumed
    const result = computeBufferBurn("2026-08-03", "2026-08-17", new Date("2026-08-10"));
    expect(result.totalBufferDays).toBe(10);
    expect(result.consumedBufferDays).toBe(5);
    expect(result.bufferConsumedPct).toBeCloseTo(50, 0);
  });

  it("handles today past the committed date (over 100% buffer consumed)", () => {
    // Internal = Jul 1, committed = Jul 8 (5 buffer days), today = Jul 22 (15 days past internal)
    const result = computeBufferBurn("2026-07-01", "2026-07-08", new Date("2026-07-22"));
    expect(result.consumedBufferDays).toBeGreaterThan(result.totalBufferDays);
    expect(result.bufferConsumedPct).toBeGreaterThan(100);
    expect(result.remainingBufferDays).toBeLessThan(0);
  });
});

// ─── chainCompletionPct ───────────────────────────────────────────────────────

describe("chainCompletionPct", () => {
  it("returns 0 when no phases are complete and no within-phase progress", () => {
    expect(chainCompletionPct({ currentMilestoneIndex: 0, totalPhases: 6 })).toBe(0);
  });

  it("returns 50 when 3 of 6 phases are complete with no within-phase progress", () => {
    // Index 3 means phases 0,1,2 are done (3 complete), currently on phase 3
    expect(chainCompletionPct({ currentMilestoneIndex: 3, totalPhases: 6 })).toBeCloseTo(50, 1);
  });

  it("returns ~83.3 when 5 phases are complete (index 5, on the last phase)", () => {
    expect(chainCompletionPct({ currentMilestoneIndex: 5, totalPhases: 6 })).toBeCloseTo(83.3, 0);
  });

  it("defaults totalPhases to 6", () => {
    expect(chainCompletionPct({ currentMilestoneIndex: 3 })).toBeCloseTo(50, 1);
  });

  it("blends within-phase item progress into the completion %", () => {
    // Phase 0, 50% items done: 0.5 / 6 * 100 = 8.33%
    const pct = chainCompletionPct({
      currentMilestoneIndex: 0,
      totalPhases: 6,
      withinPhaseItemsDone: 2,
      withinPhaseItemsTotal: 4,
    });
    expect(pct).toBeCloseTo((0 + 0.5) / 6 * 100, 1);
  });

  it("treats 0 within-phase items as full phase in progress (0% within-phase)", () => {
    const noItems = chainCompletionPct({ currentMilestoneIndex: 2, totalPhases: 6 });
    const zeroItems = chainCompletionPct({
      currentMilestoneIndex: 2,
      withinPhaseItemsDone: 0,
      withinPhaseItemsTotal: 0,
    });
    expect(noItems).toBe(zeroItems);
  });

  it("returns 100 when currentMilestoneIndex >= totalPhases (all done)", () => {
    expect(chainCompletionPct({ currentMilestoneIndex: 6, totalPhases: 6 })).toBe(100);
  });
});

// ─── feverZone ───────────────────────────────────────────────────────────────

describe("feverZone", () => {
  const gy = DEFAULT_FEVER_THRESHOLDS.greenYellowRatio;
  const yr = DEFAULT_FEVER_THRESHOLDS.yellowRedRatio;

  it("is green when bufferConsumedPct ≤ chainPct × greenYellowRatio", () => {
    // At chainPct=60, green boundary = 60 * (1/3) = 20
    expect(feverZone(15, 60)).toBe("green");
    expect(feverZone(20, 60)).toBe("green");
  });

  it("is yellow when bufferConsumedPct is between the two thresholds", () => {
    // At chainPct=60: green boundary = 20, yellow/red boundary = 40
    expect(feverZone(21, 60)).toBe("yellow");
    expect(feverZone(39, 60)).toBe("yellow");
  });

  it("is red when bufferConsumedPct > chainPct × yellowRedRatio", () => {
    // At chainPct=60: yellow/red boundary = 40
    expect(feverZone(41, 60)).toBe("red");
    expect(feverZone(80, 60)).toBe("red");
  });

  it("is green when both buffer and chain are at 0% (job not started, no slippage)", () => {
    expect(feverZone(0, 0)).toBe("green");
  });

  it("is red when buffer is consumed but chain completion is 0 (slippage before any progress)", () => {
    expect(feverZone(5, 0)).toBe("red");
  });

  it("is green at 100% completion with < greenYellowRatio × 100 buffer consumed", () => {
    expect(feverZone(30, 100)).toBe("green");
  });

  it("is yellow at 100% completion between the two thresholds", () => {
    expect(feverZone(50, 100)).toBe("yellow");
  });

  it("is red at 100% completion above yellowRedRatio × 100", () => {
    expect(feverZone(70, 100)).toBe("red");
  });

  it("is red when buffer > 100% (past committed date)", () => {
    expect(feverZone(120, 80)).toBe("red");
  });

  it("respects custom thresholds", () => {
    // Custom: green/yellow at 0.25, yellow/red at 0.75
    const custom = { greenYellowRatio: 0.25, yellowRedRatio: 0.75 };
    // At chainPct=100: green up to 25, yellow 25-75, red > 75
    expect(feverZone(20, 100, custom)).toBe("green");
    expect(feverZone(50, 100, custom)).toBe("yellow");
    expect(feverZone(80, 100, custom)).toBe("red");
  });
});

// ─── computeRecoveryFlag ─────────────────────────────────────────────────────

describe("computeRecoveryFlag", () => {
  it("is inactive (not at risk) when zone is green", () => {
    const flag = computeRecoveryFlag("green");
    expect(flag.active).toBe(false);
    expect(flag.zone).toBe("green");
  });

  it("is inactive when zone is yellow (still early warning, not yet at risk)", () => {
    const flag = computeRecoveryFlag("yellow");
    expect(flag.active).toBe(false);
    expect(flag.zone).toBe("yellow");
  });

  it("is active with the recovery message when zone is red", () => {
    const flag = computeRecoveryFlag("red");
    expect(flag.active).toBe(true);
    expect(flag.zone).toBe("red");
    expect(flag.message).toMatch(/commitment at risk/i);
    expect(flag.message).toMatch(/act now/i);
  });
});

// ─── deriveHealthFromFever ────────────────────────────────────────────────────

describe("deriveHealthFromFever", () => {
  it("maps green zone to on_track", () => {
    expect(deriveHealthFromFever("green", "on_track")).toBe("on_track");
  });

  it("maps yellow zone to at_risk", () => {
    expect(deriveHealthFromFever("yellow", "on_track")).toBe("at_risk");
  });

  it("maps red zone to blocked", () => {
    expect(deriveHealthFromFever("red", "on_track")).toBe("blocked");
  });

  it("never overrides complete status", () => {
    expect(deriveHealthFromFever("red", "complete")).toBe("complete");
    expect(deriveHealthFromFever("green", "complete")).toBe("complete");
  });

  it("never overrides paused status", () => {
    expect(deriveHealthFromFever("red", "paused")).toBe("paused");
    expect(deriveHealthFromFever("green", "paused")).toBe("paused");
  });

  it("active blockers always produce blocked regardless of zone", () => {
    expect(deriveHealthFromFever("green", "on_track", [mockBlocker()])).toBe("blocked");
    expect(deriveHealthFromFever("yellow", "on_track", [mockBlocker()])).toBe("blocked");
  });

  it("defaults to empty blockers array when not passed", () => {
    expect(deriveHealthFromFever("green", "on_track")).toBe("on_track");
  });
});
