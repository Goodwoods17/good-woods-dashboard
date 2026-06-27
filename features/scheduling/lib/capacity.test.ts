import { describe, it, expect } from "vitest";
import {
  sessionActiveHours,
  phaseLoadHours,
  phaseUtilization,
  buildCapacityModel,
  seedPhaseDurationsFromHistory,
  phaseTargetDatesFromDurations,
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  DEFAULT_PHASE_DURATION_DAYS,
  HOURS_PER_WORK_DAY,
  type CapacitySession,
} from "./capacity";
import type { MilestoneStage } from "@shared/lib/types";

const HOUR_MS = 3_600_000;

// A completed session: accumulatedMs banks the full active total on Stop.
const done = (
  categoryId: string | null,
  hours: number,
  overrides: Partial<CapacitySession> = {}
): CapacitySession => ({
  categoryId,
  jobId: "job-1",
  startedAt: "2026-06-15T09:00:00.000Z",
  endedAt: "2026-06-15T17:00:00.000Z",
  accumulatedMs: hours * HOUR_MS,
  resumedAt: null,
  ...overrides,
});

describe("sessionActiveHours", () => {
  it("reads the banked active total from a stopped session", () => {
    expect(sessionActiveHours(done("assembly", 3))).toBe(3);
  });

  it("falls back to wall-clock for legacy pre-pause rows (accumulated 0, never resumed)", () => {
    // 09:00 → 17:00 = 8h, the legacy survival path.
    const legacy = done("assembly", 0, {
      accumulatedMs: 0,
      resumedAt: null,
      startedAt: "2026-06-15T09:00:00.000Z",
      endedAt: "2026-06-15T17:00:00.000Z",
    });
    expect(sessionActiveHours(legacy)).toBe(8);
  });

  it("ignores running sessions (no ended_at) — only completed history counts", () => {
    const running = done("assembly", 2, { endedAt: null, accumulatedMs: 2 * HOUR_MS });
    expect(sessionActiveHours(running)).toBe(0);
  });
});

describe("phaseLoadHours", () => {
  const start = "2026-06-15T00:00:00.000Z";
  const end = "2026-06-22T00:00:00.000Z"; // one-week window

  it("sums active hours per phase for completed sessions inside the window", () => {
    const load = phaseLoadHours(
      [done("assembly", 3), done("assembly", 2), done("cnc", 4), done("design", 1)],
      start,
      end
    );
    expect(load.assembly).toBe(5);
    expect(load.cnc).toBe(4);
    expect(load.design).toBe(1);
    expect(load.finishing).toBe(0);
  });

  it("excludes sessions started outside the window", () => {
    const before = done("assembly", 9, {
      startedAt: "2026-06-01T09:00:00.000Z",
      endedAt: "2026-06-01T17:00:00.000Z",
    });
    const load = phaseLoadHours([before, done("assembly", 2)], start, end);
    expect(load.assembly).toBe(2);
  });

  it("ignores sessions tagged to an unknown/null phase", () => {
    const load = phaseLoadHours(
      [done(null, 5), done("not-a-phase", 7), done("cnc", 1)],
      start,
      end
    );
    expect(load.cnc).toBe(1);
    // Unknown categories never leak into the six-phase totals.
    expect(Object.values(load).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("phaseUtilization", () => {
  it("is under capacity below the near threshold", () => {
    expect(phaseUtilization(20, 40).status).toBe("under");
  });

  it("is near capacity in the warning band", () => {
    expect(phaseUtilization(38, 40).status).toBe("near");
  });

  it("is over capacity past 100%", () => {
    const u = phaseUtilization(50, 40);
    expect(u.status).toBe("over");
    expect(u.ratio).toBeCloseTo(1.25);
  });

  it("treats any load against zero capacity as over capacity", () => {
    expect(phaseUtilization(5, 0).status).toBe("over");
  });

  it("is under (ratio 0) when there is no load and no capacity", () => {
    const u = phaseUtilization(0, 0);
    expect(u.status).toBe("under");
    expect(u.ratio).toBe(0);
  });
});

describe("buildCapacityModel", () => {
  it("returns a row for every one of the six phases, load + capacity + status", () => {
    const model = buildCapacityModel(
      [done("assembly", 50)],
      { ...DEFAULT_WEEKLY_CAPACITY_HOURS, assembly: 40 },
      "2026-06-15T00:00:00.000Z",
      "2026-06-22T00:00:00.000Z"
    );
    expect(model).toHaveLength(6);
    const assembly = model.find((r) => r.phase === "assembly")!;
    expect(assembly.loadHours).toBe(50);
    expect(assembly.capacityHours).toBe(40);
    expect(assembly.status).toBe("over");
    // Phases with no logged time read zero load, under capacity.
    const finishing = model.find((r) => r.phase === "finishing")!;
    expect(finishing.loadHours).toBe(0);
    expect(finishing.status).toBe("under");
  });
});

describe("seedPhaseDurationsFromHistory", () => {
  it("falls back to the static defaults for a phase with no history", () => {
    const durations = seedPhaseDurationsFromHistory([]);
    expect(durations).toEqual(DEFAULT_PHASE_DURATION_DAYS);
  });

  it("derives a phase duration from the average active hours PER JOB, in work days", () => {
    // assembly: job-1 logs 16h total, job-2 logs 8h → average 12h/job.
    // 12h ÷ 8h/day = 1.5 → rounds UP to 2 work days.
    const sessions: CapacitySession[] = [
      done("assembly", 10, { jobId: "job-1" }),
      done("assembly", 6, { jobId: "job-1" }),
      done("assembly", 8, { jobId: "job-2" }),
    ];
    const durations = seedPhaseDurationsFromHistory(sessions);
    expect(durations.assembly).toBe(2);
    // Untouched phases keep their fallback default — not zeroed.
    expect(durations.design).toBe(DEFAULT_PHASE_DURATION_DAYS.design);
  });

  it("never returns less than one day when there is any history for a phase", () => {
    const durations = seedPhaseDurationsFromHistory([done("delivery", 0.5, { jobId: "job-9" })]);
    expect(durations.delivery).toBe(1);
  });
});

describe("phaseTargetDatesFromDurations", () => {
  it("chains durations from the start date into per-phase internal target dates", () => {
    const durations: Record<MilestoneStage, number> = {
      design: 2,
      cnc: 1,
      assembly: 3,
      finishing: 1,
      delivery: 1,
      install: 1,
    };
    const targets = phaseTargetDatesFromDurations("2026-07-01", durations);
    // design ends 2 work days after start: Jul 1 (Wed) + 2 wd → Jul 2 is day 1,
    // Jul 3 is day 2 → target 2026-07-03.
    expect(targets.design).toBe("2026-07-03");
    // cnc adds 1 wd → Mon Jul 6 (skips the weekend Jul 4-5).
    expect(targets.cnc).toBe("2026-07-06");
  });

  it("constants line up: six phases, sane work day length", () => {
    expect(HOURS_PER_WORK_DAY).toBe(8);
    expect(Object.keys(DEFAULT_PHASE_DURATION_DAYS)).toHaveLength(6);
  });
});
