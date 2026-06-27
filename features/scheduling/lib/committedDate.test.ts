import { describe, it, expect } from "vitest";
import {
  capacityAdjustedDuration,
  computeCapacityAwareSchedule,
  computeRiskTieredBuffer,
  capacityAwareCommittedDate,
  detectFloatingBottleneck,
  phaseVarianceNudgeDays,
  BASE_BUFFER_PCT,
  DAYS_PER_SUB_DEPENDENCY,
  MAX_CAPACITY_STRETCH,
} from "./committedDate";
import type { PhaseCapacityRow, CapacitySession } from "./capacity";
import type { MilestoneStage } from "@shared/lib/types";

const HOUR_MS = 3_600_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function row(
  phase: MilestoneStage,
  ratio: number,
  status: PhaseCapacityRow["status"] = ratio > 1 ? "over" : ratio >= 0.85 ? "near" : "under"
): PhaseCapacityRow {
  return {
    phase,
    label: phase,
    loadHours: ratio * 40,
    capacityHours: 40,
    ratio,
    status,
  };
}

function allRows(overrides: Partial<Record<MilestoneStage, number>> = {}): PhaseCapacityRow[] {
  const phases: MilestoneStage[] = ["design", "cnc", "assembly", "finishing", "delivery", "install"];
  return phases.map((p) => row(p, overrides[p] ?? 0));
}

const flatDurations: Record<MilestoneStage, number> = {
  design: 5,
  cnc: 3,
  assembly: 5,
  finishing: 3,
  delivery: 1,
  install: 2,
};

const done = (
  categoryId: string | null,
  hours: number,
  jobId = "job-1"
): CapacitySession => ({
  categoryId,
  jobId,
  startedAt: "2026-06-15T09:00:00.000Z",
  endedAt: "2026-06-15T17:00:00.000Z",
  accumulatedMs: hours * HOUR_MS,
  resumedAt: null,
});

// ── capacityAdjustedDuration ─────────────────────────────────────────────────

describe("capacityAdjustedDuration", () => {
  it("returns the base duration unchanged when ratio ≤ 1 (at or under capacity)", () => {
    expect(capacityAdjustedDuration(5, 0)).toBe(5);
    expect(capacityAdjustedDuration(5, 0.5)).toBe(5);
    expect(capacityAdjustedDuration(5, 1)).toBe(5);
  });

  it("stretches the duration proportionally when over capacity", () => {
    // ratio 1.25 × 4 days = 5 days
    expect(capacityAdjustedDuration(4, 1.25)).toBe(5);
  });

  it("rounds up fractional stretched durations", () => {
    // ratio 1.1 × 3 days = 3.3 → ceils to 4
    expect(capacityAdjustedDuration(3, 1.1)).toBe(4);
  });

  it("caps the stretch at MAX_CAPACITY_STRETCH", () => {
    // Ratio 10× is absurd; cap at 3× base.
    expect(capacityAdjustedDuration(5, 10)).toBe(Math.ceil(5 * MAX_CAPACITY_STRETCH));
  });

  it("returns 0 for a zero-duration phase regardless of ratio", () => {
    expect(capacityAdjustedDuration(0, 2)).toBe(0);
  });
});

// ── computeCapacityAwareSchedule ──────────────────────────────────────────────

describe("computeCapacityAwareSchedule", () => {
  it("returns the same schedule as flat-chaining when all phases are at or under capacity", () => {
    const underRows = allRows(); // all ratio 0 → all under
    const result = computeCapacityAwareSchedule("2026-07-01", flatDurations, underRows);
    // 5+3+5+3+1+2 = 19 work days from Wed 1 Jul 2026.
    expect(result.totalWorkDays).toBe(19);
    expect(result.internalTargetDate).toBe(result.phaseTargetDates.install);
  });

  it("stretches an overloaded phase and pushes all subsequent phase dates later", () => {
    // assembly is 1.5× loaded → base 5d becomes ceil(5 × 1.5) = 8d
    const rows = allRows({ assembly: 1.5 });
    const flat = computeCapacityAwareSchedule("2026-07-01", flatDurations, allRows());
    const loaded = computeCapacityAwareSchedule("2026-07-01", flatDurations, rows);
    // loaded schedule must be strictly longer
    expect(loaded.totalWorkDays).toBeGreaterThan(flat.totalWorkDays);
    expect(loaded.phaseTargetDates.install > flat.phaseTargetDates.install).toBe(true);
  });

  it("chains phases in milestone order and skips weekends", () => {
    const singlePhase: Record<MilestoneStage, number> = {
      design: 2,
      cnc: 0,
      assembly: 0,
      finishing: 0,
      delivery: 0,
      install: 0,
    };
    const result = computeCapacityAwareSchedule("2026-07-01", singlePhase, allRows());
    // Wed Jul 1 + 2 work days → Thu Jul 2 = day 1, Fri Jul 3 = day 2
    expect(result.phaseTargetDates.design).toBe("2026-07-03");
    // All later phases share the same date (0 duration)
    expect(result.phaseTargetDates.cnc).toBe("2026-07-03");
  });

  it("handles a missing capacity row by treating the ratio as 1 (no stretch)", () => {
    // Pass an empty rows array — no phase has a capacity row.
    const result = computeCapacityAwareSchedule("2026-07-01", flatDurations, []);
    expect(result.totalWorkDays).toBe(19);
  });
});

// ── computeRiskTieredBuffer ───────────────────────────────────────────────────

describe("computeRiskTieredBuffer", () => {
  it("computes a base fraction of the total internal days", () => {
    // 20 days × 15% = 3 days (exactly), 0 subs, 0 variance
    const b = computeRiskTieredBuffer({ totalInternalDays: 20, subDependencyCount: 0 });
    expect(b.baseDays).toBe(Math.ceil(20 * BASE_BUFFER_PCT));
    expect(b.subDays).toBe(0);
    expect(b.varianceDays).toBe(0);
    expect(b.totalDays).toBe(b.baseDays);
    expect(b.isOverridden).toBe(false);
  });

  it("adds DAYS_PER_SUB_DEPENDENCY per external sub-trade dependency", () => {
    const b = computeRiskTieredBuffer({ totalInternalDays: 20, subDependencyCount: 2 });
    expect(b.subDays).toBe(2 * DAYS_PER_SUB_DEPENDENCY);
    expect(b.totalDays).toBe(b.baseDays + b.subDays);
  });

  it("adds the variance nudge on top of base + subs", () => {
    const b = computeRiskTieredBuffer({
      totalInternalDays: 20,
      subDependencyCount: 1,
      varianceNudgeDays: 3,
    });
    expect(b.varianceDays).toBe(3);
    expect(b.totalDays).toBe(b.baseDays + b.subDays + 3);
  });

  it("respects the per-job override and flags isOverridden", () => {
    const b = computeRiskTieredBuffer({
      totalInternalDays: 20,
      subDependencyCount: 2,
      varianceNudgeDays: 3,
      overrideBufferDays: 7,
    });
    expect(b.totalDays).toBe(7);
    expect(b.isOverridden).toBe(true);
    // Formula components are still computed for transparency
    expect(b.baseDays).toBeGreaterThan(0);
  });

  it("clamps negative sub count and variance to zero", () => {
    const b = computeRiskTieredBuffer({
      totalInternalDays: 10,
      subDependencyCount: -1,
      varianceNudgeDays: -5,
    });
    expect(b.subDays).toBe(0);
    expect(b.varianceDays).toBe(0);
  });

  it("rounds the base fraction UP so the buffer is never undersized", () => {
    // 19 days × 0.15 = 2.85 → ceils to 3
    const b = computeRiskTieredBuffer({ totalInternalDays: 19, subDependencyCount: 0 });
    expect(b.baseDays).toBe(3);
  });
});

// ── capacityAwareCommittedDate ────────────────────────────────────────────────

describe("capacityAwareCommittedDate", () => {
  it("returns the internal target itself when buffer is 0", () => {
    expect(capacityAwareCommittedDate("2026-08-01", 0)).toBe("2026-08-01");
  });

  it("adds buffer work days (weekends skipped)", () => {
    // Fri 2026-07-31 + 3 work days → Mon 4, Tue 5, Wed 6 Aug
    expect(capacityAwareCommittedDate("2026-07-31", 3)).toBe("2026-08-05");
  });

  it("treats negative buffer the same as zero", () => {
    expect(capacityAwareCommittedDate("2026-08-01", -2)).toBe("2026-08-01");
  });
});

// ── phaseVarianceNudgeDays ─────────────────────────────────────────────────────

describe("phaseVarianceNudgeDays", () => {
  it("returns 0 when there are no sessions", () => {
    expect(phaseVarianceNudgeDays([])).toBe(0);
  });

  it("returns 0 when a phase has only one job (not enough to read variance from)", () => {
    const sessions: CapacitySession[] = [done("assembly", 8, "job-1")];
    expect(phaseVarianceNudgeDays(sessions)).toBe(0);
  });

  it("returns a non-zero nudge when phase durations vary significantly across jobs", () => {
    // job-1: 8h assembly, job-2: 24h assembly → stdDev = 8h → ceil(8/8) = 1 day
    const sessions: CapacitySession[] = [
      done("assembly", 8, "job-1"),
      done("assembly", 24, "job-2"),
    ];
    const nudge = phaseVarianceNudgeDays(sessions);
    expect(nudge).toBeGreaterThan(0);
  });

  it("caps the total nudge at maxNudgeDays", () => {
    // Force extreme variance across many phases
    const sessions: CapacitySession[] = (
      ["design", "cnc", "assembly", "finishing", "delivery", "install"] as MilestoneStage[]
    ).flatMap((phase) => [done(phase, 1, "job-1"), done(phase, 100, "job-2")]);
    const nudge = phaseVarianceNudgeDays(sessions, 5);
    expect(nudge).toBe(5);
  });

  it("ignores unknown/null phase tags", () => {
    const sessions: CapacitySession[] = [
      done(null, 10, "job-1"),
      done("not-a-phase", 10, "job-2"),
    ];
    expect(phaseVarianceNudgeDays(sessions)).toBe(0);
  });
});

// ── detectFloatingBottleneck ───────────────────────────────────────────────────

describe("detectFloatingBottleneck", () => {
  it("returns null when all phases are under capacity", () => {
    expect(detectFloatingBottleneck(allRows())).toBeNull();
  });

  it("returns the single over-capacity phase", () => {
    const rows = allRows({ assembly: 1.5 });
    const bottleneck = detectFloatingBottleneck(rows);
    expect(bottleneck).not.toBeNull();
    expect(bottleneck!.phase).toBe("assembly");
  });

  it("returns the most-overloaded phase when multiple phases are over capacity", () => {
    const rows = allRows({ cnc: 1.2, assembly: 1.8, finishing: 1.4 });
    const bottleneck = detectFloatingBottleneck(rows);
    expect(bottleneck!.phase).toBe("assembly");
  });

  it("includes near-capacity phases as candidates (not just over)", () => {
    // 0.9 ratio → near (above the 0.85 threshold), nothing is over
    const rows = allRows({ design: 0.9 });
    const bottleneck = detectFloatingBottleneck(rows);
    expect(bottleneck).not.toBeNull();
    expect(bottleneck!.phase).toBe("design");
  });

  it("prefers the higher ratio when two phases tie in status but differ in ratio", () => {
    const rows: PhaseCapacityRow[] = [
      row("cnc", 1.3),
      row("assembly", 1.5),
      row("finishing", 1.1),
    ].concat(
      (["design", "delivery", "install"] as MilestoneStage[]).map((p) => row(p, 0))
    );
    expect(detectFloatingBottleneck(rows)!.phase).toBe("assembly");
  });
});
