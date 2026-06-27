import { describe, it, expect } from "vitest";
import {
  phaseAvailableHours,
  weekMondayOf,
  weekLabel,
  buildWeeklyWindows,
  findEarliestBookableStart,
  MIN_BOOKABLE_HOURS,
  type CapacityWindow,
} from "./freeCapacity";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  type CapacitySession,
} from "./capacity";

const HOUR_MS = 3_600_000;

/** A completed session within the given week (Mon–Fri, UTC). */
const sessionInWeek = (
  weekStart: string,
  categoryId: string,
  hours: number,
  jobId = "job-1"
): CapacitySession => {
  const start = new Date(`${weekStart}T09:00:00.000Z`);
  const end = new Date(start.getTime() + hours * HOUR_MS);
  return {
    categoryId,
    jobId,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    accumulatedMs: hours * HOUR_MS,
    resumedAt: null,
  };
};

describe("phaseAvailableHours", () => {
  it("returns capacity minus load, floored at 0", () => {
    const rows = [
      { phase: "design" as const, label: "Design", loadHours: 10, capacityHours: 40, ratio: 0.25, status: "under" as const },
      { phase: "assembly" as const, label: "Assembly", loadHours: 50, capacityHours: 40, ratio: 1.25, status: "over" as const },
      { phase: "cnc" as const, label: "CNC", loadHours: 0, capacityHours: 40, ratio: 0, status: "under" as const },
      { phase: "finishing" as const, label: "Finishing", loadHours: 40, capacityHours: 40, ratio: 1, status: "near" as const },
      { phase: "delivery" as const, label: "Delivery", loadHours: 5, capacityHours: 40, ratio: 0.125, status: "under" as const },
      { phase: "install" as const, label: "Install", loadHours: 0, capacityHours: 40, ratio: 0, status: "under" as const },
    ];
    const free = phaseAvailableHours(rows);
    expect(free.design).toBe(30);
    // Over capacity → no free hours (clamped to 0, never negative)
    expect(free.assembly).toBe(0);
    expect(free.cnc).toBe(40);
    // Exactly at capacity → 0 free
    expect(free.finishing).toBe(0);
    expect(free.delivery).toBe(35);
    expect(free.install).toBe(40);
  });
});

describe("weekMondayOf", () => {
  it("returns the same date when the input is already Monday", () => {
    // 2026-06-29 is a Monday
    expect(weekMondayOf("2026-06-29")).toBe("2026-06-29");
  });

  it("returns the preceding Monday for a mid-week date", () => {
    // 2026-07-01 is a Wednesday → Monday 2026-06-29
    expect(weekMondayOf("2026-07-01")).toBe("2026-06-29");
  });

  it("returns the preceding Monday for a Friday", () => {
    // 2026-07-03 is a Friday → Monday 2026-06-29
    expect(weekMondayOf("2026-07-03")).toBe("2026-06-29");
  });

  it("returns the preceding Monday for Sunday", () => {
    // 2026-06-28 is a Sunday → Monday 2026-06-22
    expect(weekMondayOf("2026-06-28")).toBe("2026-06-22");
  });
});

describe("weekLabel", () => {
  it("formats a week label from a Monday ISO date", () => {
    expect(weekLabel("2026-08-03")).toBe("Week of Aug 3");
  });

  it("formats correctly for a Monday in December", () => {
    expect(weekLabel("2026-12-07")).toBe("Week of Dec 7");
  });
});

describe("buildWeeklyWindows", () => {
  // A Monday in a test week
  const TODAY = "2026-07-07"; // Tuesday

  it("returns the requested number of windows starting from today's Monday", () => {
    const windows = buildWeeklyWindows([], DEFAULT_WEEKLY_CAPACITY_HOURS, TODAY, 4);
    expect(windows).toHaveLength(4);
    // First window starts on the Monday of today's week: 2026-07-06
    expect(windows[0].weekStart).toBe("2026-07-06");
    // Subsequent windows are successive Mondays
    expect(windows[1].weekStart).toBe("2026-07-13");
    expect(windows[2].weekStart).toBe("2026-07-20");
    expect(windows[3].weekStart).toBe("2026-07-27");
  });

  it("week end is always the Friday of the same week", () => {
    const windows = buildWeeklyWindows([], DEFAULT_WEEKLY_CAPACITY_HOURS, TODAY, 1);
    // 2026-07-06 (Mon) → 2026-07-10 (Fri)
    expect(windows[0].weekEnd).toBe("2026-07-10");
  });

  it("sessions within a window reduce free hours for that week", () => {
    const monday = "2026-07-06";
    // 32h of assembly load this week
    const sessions = [sessionInWeek(monday, "assembly", 32)];
    const windows = buildWeeklyWindows(
      sessions,
      DEFAULT_WEEKLY_CAPACITY_HOURS,
      TODAY,
      2
    );
    // First window (this week): 40h capacity - 32h load = 8h free
    expect(windows[0].freeHoursByPhase.assembly).toBe(8);
    // Second window (next week, no sessions): 40h free
    expect(windows[1].freeHoursByPhase.assembly).toBe(40);
  });

  it("marks a window as bookable only when ALL phases have >= MIN_BOOKABLE_HOURS free", () => {
    const monday = "2026-07-06";
    // Over-load assembly: 48h vs 40h capacity → 0 free (over)
    const sessions = [sessionInWeek(monday, "assembly", 48)];
    const windows = buildWeeklyWindows(
      sessions,
      DEFAULT_WEEKLY_CAPACITY_HOURS,
      TODAY,
      2
    );
    // This week: assembly is over → NOT bookable
    expect(windows[0].isBookable).toBe(false);
    // Next week: all phases clear → bookable
    expect(windows[1].isBookable).toBe(true);
  });

  it("marks a window as bookable when all phases are comfortably under capacity", () => {
    const windows = buildWeeklyWindows([], DEFAULT_WEEKLY_CAPACITY_HOURS, TODAY, 1);
    // No load at all → all phases fully free → bookable
    expect(windows[0].isBookable).toBe(true);
  });

  it("includes a human-readable label for each window", () => {
    const windows = buildWeeklyWindows([], DEFAULT_WEEKLY_CAPACITY_HOURS, "2026-08-04", 1);
    // 2026-08-04 is Tuesday → Monday is 2026-08-03
    expect(windows[0].label).toBe("Week of Aug 3");
  });
});

describe("findEarliestBookableStart", () => {
  const makeWindow = (weekStart: string, bookable: boolean): CapacityWindow => {
    const freeHours = bookable ? 40 : 0;
    const freeHoursByPhase = {
      design: freeHours,
      cnc: freeHours,
      assembly: freeHours,
      finishing: freeHours,
      delivery: freeHours,
      install: freeHours,
    };
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    const friday = new Date(date.getTime() + 4 * 24 * 3_600_000);
    const weekEnd = friday.toISOString().slice(0, 10);
    return {
      weekStart,
      weekEnd,
      label: weekLabel(weekStart),
      freeHoursByPhase,
      isBookable: bookable,
    };
  };

  it("returns null when no windows are bookable", () => {
    const windows = [
      makeWindow("2026-07-06", false),
      makeWindow("2026-07-13", false),
    ];
    expect(findEarliestBookableStart(windows)).toBeNull();
  });

  it("returns the first bookable window when the first week has capacity", () => {
    const windows = [makeWindow("2026-07-06", true)];
    const slot = findEarliestBookableStart(windows);
    expect(slot).not.toBeNull();
    expect(slot!.weekStart).toBe("2026-07-06");
    expect(slot!.label).toBe("Week of Jul 6");
  });

  it("returns the first bookable window when earlier weeks are full", () => {
    const windows = [
      makeWindow("2026-07-06", false), // this week: assembly over
      makeWindow("2026-07-13", false), // next week: still busy
      makeWindow("2026-07-20", true),  // week 3: open
    ];
    const slot = findEarliestBookableStart(windows);
    expect(slot).not.toBeNull();
    expect(slot!.weekStart).toBe("2026-07-20");
    expect(slot!.label).toBe("Week of Jul 20");
  });

  it("passes back the free hours from the bookable week", () => {
    const windows = [makeWindow("2026-08-03", true)];
    const slot = findEarliestBookableStart(windows);
    expect(slot).not.toBeNull();
    expect(slot!.freeHoursByPhase.assembly).toBe(40);
  });

  it("MIN_BOOKABLE_HOURS is at least one full work day (8h)", () => {
    expect(MIN_BOOKABLE_HOURS).toBeGreaterThanOrEqual(8);
  });
});
