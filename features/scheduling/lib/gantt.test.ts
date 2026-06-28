import { describe, it, expect } from "vitest";
import { rippleForward, pullPlanBackward, type PinnedPhases } from "./gantt";
import { addWorkDays, workDaysBetween } from "@shared/lib/workdays";
import type { MilestoneStage } from "@shared/lib/types";

// ── addWorkDays ──────────────────────────────────────────────────────────────

describe("addWorkDays", () => {
  it("returns the same date when n = 0", () => {
    expect(addWorkDays("2026-06-09", 0)).toBe("2026-06-09");
  });

  it("adds weekdays forward", () => {
    // Monday 2026-06-08 + 1 = Tuesday 2026-06-09
    expect(addWorkDays("2026-06-08", 1)).toBe("2026-06-09");
    // Monday 2026-06-08 + 5 = Monday 2026-06-15 (next Mon)
    expect(addWorkDays("2026-06-08", 5)).toBe("2026-06-15");
  });

  it("skips weekends when adding forward", () => {
    // Friday 2026-06-05 + 1 = Monday 2026-06-08
    expect(addWorkDays("2026-06-05", 1)).toBe("2026-06-08");
    // Friday 2026-06-05 + 2 = Tuesday 2026-06-09
    expect(addWorkDays("2026-06-05", 2)).toBe("2026-06-09");
  });

  it("subtracts weekdays backward (negative n)", () => {
    // Tuesday 2026-06-09 - 1 = Monday 2026-06-08
    expect(addWorkDays("2026-06-09", -1)).toBe("2026-06-08");
    // Monday 2026-06-08 - 1 = Friday 2026-06-05
    expect(addWorkDays("2026-06-08", -1)).toBe("2026-06-05");
  });

  it("skips weekends when subtracting backward", () => {
    // Monday 2026-06-15 - 5 = Monday 2026-06-08
    expect(addWorkDays("2026-06-15", -5)).toBe("2026-06-08");
    // Monday 2026-06-08 - 2 = Thursday 2026-06-04
    expect(addWorkDays("2026-06-08", -2)).toBe("2026-06-04");
  });
});

// ── workDaysBetween ──────────────────────────────────────────────────────────

describe("workDaysBetween", () => {
  it("returns 0 for the same date", () => {
    expect(workDaysBetween("2026-06-09", "2026-06-09")).toBe(0);
  });

  it("returns 1 for adjacent weekdays", () => {
    // Mon → Tue = 1
    expect(workDaysBetween("2026-06-08", "2026-06-09")).toBe(1);
    // Thu → Fri = 1
    expect(workDaysBetween("2026-06-04", "2026-06-05")).toBe(1);
  });

  it("returns 1 for Fri → Mon (skips weekend)", () => {
    expect(workDaysBetween("2026-06-05", "2026-06-08")).toBe(1);
  });

  it("returns 4 for Mon → Fri of same week", () => {
    expect(workDaysBetween("2026-06-08", "2026-06-12")).toBe(4);
  });

  it("spans a full work week across a weekend", () => {
    // Mon Jun 8 → Mon Jun 15 = 5 work days
    expect(workDaysBetween("2026-06-08", "2026-06-15")).toBe(5);
  });

  it("returns negative when to is before from", () => {
    expect(workDaysBetween("2026-06-09", "2026-06-08")).toBe(-1);
    expect(workDaysBetween("2026-06-15", "2026-06-08")).toBe(-5);
  });

  it("is the inverse of addWorkDays", () => {
    const from = "2026-06-08";
    const n = 7;
    const to = addWorkDays(from, n);
    expect(workDaysBetween(from, to)).toBe(n);
  });
});

// ── rippleForward ────────────────────────────────────────────────────────────

// Baseline phase dates for ripple tests. All on weekdays; gaps match the
// DEFAULT_PHASE_DURATION_DAYS from capacity.ts.
//   design:   2026-06-05 (Fri)
//   cnc:      2026-06-10 (Wed) — +3 work days
//   assembly: 2026-06-17 (Wed) — +5 work days
//   finishing:2026-06-22 (Mon) — +3 work days
//   delivery: 2026-06-23 (Tue) — +1 work day
//   install:  2026-06-25 (Thu) — +2 work days
const BASE_DATES: Partial<Record<MilestoneStage, string>> = {
  design: "2026-06-05",
  cnc: "2026-06-10",
  assembly: "2026-06-17",
  finishing: "2026-06-22",
  delivery: "2026-06-23",
  install: "2026-06-25",
};

describe("rippleForward", () => {
  it("is a no-op when the new date equals the old date", () => {
    const noPins: PinnedPhases = new Set();
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-10", noPins);
    expect(conflicts).toHaveLength(0);
    expect(dates.cnc).toBe("2026-06-10");
    expect(dates.assembly).toBe("2026-06-17");
  });

  it("shifts all downstream phases by the same work-day delta (positive)", () => {
    const noPins: PinnedPhases = new Set();
    // Move cnc from Wed Jun 10 → Fri Jun 12 (+2 work days).
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-12", noPins);
    expect(conflicts).toHaveLength(0);
    // Upstream design is unchanged.
    expect(dates.design).toBe("2026-06-05");
    // cnc itself moves to new date.
    expect(dates.cnc).toBe("2026-06-12");
    // Downstream phases each shift by +2 work days.
    // assembly: 2026-06-17 + 2wd = 2026-06-19 (Fri)
    expect(dates.assembly).toBe("2026-06-19");
    // finishing: 2026-06-22 + 2wd = 2026-06-24 (Wed)
    expect(dates.finishing).toBe("2026-06-24");
    // delivery: 2026-06-23 + 2wd = 2026-06-25 (Thu)
    expect(dates.delivery).toBe("2026-06-25");
    // install: 2026-06-25 + 2wd = 2026-06-29 (Mon)
    expect(dates.install).toBe("2026-06-29");
  });

  it("shifts downstream phases by a negative delta (earlier)", () => {
    const noPins: PinnedPhases = new Set();
    // Move cnc from Wed Jun 10 → Mon Jun 08 (-2 work days).
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-08", noPins);
    expect(conflicts).toHaveLength(0);
    // Upstream design unchanged.
    expect(dates.design).toBe("2026-06-05");
    // cnc moves earlier.
    expect(dates.cnc).toBe("2026-06-08");
    // assembly: 2026-06-17 - 2wd = 2026-06-13 (Sat? no — 2026-06-15 Mon? Let's compute)
    // Jun 17 - 1wd = Jun 16, - 2wd = Jun 15 (Mon)
    expect(dates.assembly).toBe("2026-06-15");
  });

  it("does not affect upstream phases", () => {
    const noPins: PinnedPhases = new Set();
    const { dates } = rippleForward(BASE_DATES, "assembly", "2026-06-20", noPins);
    // design and cnc are upstream — untouched.
    expect(dates.design).toBe("2026-06-05");
    expect(dates.cnc).toBe("2026-06-10");
    // assembly itself is set.
    expect(dates.assembly).toBe("2026-06-20");
  });

  it("moving the last phase has no downstream phases to shift", () => {
    const noPins: PinnedPhases = new Set();
    const { dates, conflicts } = rippleForward(BASE_DATES, "install", "2026-07-01", noPins);
    expect(conflicts).toHaveLength(0);
    expect(dates.install).toBe("2026-07-01");
    // All other phases unchanged.
    expect(dates.delivery).toBe("2026-06-23");
  });

  it("emits a conflict for a pinned downstream phase and does not shift it", () => {
    const pinned: PinnedPhases = new Set<MilestoneStage>(["assembly"]);
    // Move cnc +2 work days → assembly is pinned.
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-12", pinned);
    // Conflict recorded for assembly.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].phase).toBe("assembly");
    expect(conflicts[0].type).toBe("pinned_anchor_violated");
    // assembly stays pinned.
    expect(dates.assembly).toBe("2026-06-17");
    // cnc moved.
    expect(dates.cnc).toBe("2026-06-12");
  });

  it("non-pinned phases downstream of a pinned anchor still shift", () => {
    // assembly is pinned but finishing, delivery, install are not.
    const pinned: PinnedPhases = new Set<MilestoneStage>(["assembly"]);
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-12", pinned);
    expect(conflicts).toHaveLength(1);
    // finishing, delivery, install shift even though assembly was skipped.
    // The delta applied to them is still +2 (the original cnc delta).
    expect(dates.finishing).toBe("2026-06-24");
    expect(dates.delivery).toBe("2026-06-25");
    expect(dates.install).toBe("2026-06-29");
  });

  it("handles multiple pinned phases correctly", () => {
    const pinned: PinnedPhases = new Set<MilestoneStage>(["assembly", "install"]);
    const { dates, conflicts } = rippleForward(BASE_DATES, "cnc", "2026-06-12", pinned);
    expect(conflicts).toHaveLength(2);
    // assembly and install pinned; finishing and delivery still shift.
    expect(dates.assembly).toBe("2026-06-17"); // pinned
    expect(dates.finishing).toBe("2026-06-24"); // shifted +2
    expect(dates.delivery).toBe("2026-06-25"); // shifted +2
    expect(dates.install).toBe("2026-06-25"); // pinned (unchanged)
  });

  it("skips phases with no date set (partial phaseTargetDates)", () => {
    const partial: Partial<Record<MilestoneStage, string>> = {
      cnc: "2026-06-10",
      install: "2026-06-25",
      // design, assembly, finishing, delivery missing
    };
    const noPins: PinnedPhases = new Set();
    const { dates, conflicts } = rippleForward(partial, "cnc", "2026-06-12", noPins);
    expect(conflicts).toHaveLength(0);
    // Phases with no date are still absent.
    expect(dates.design).toBeUndefined();
    expect(dates.assembly).toBeUndefined();
    // install shifts.
    expect(dates.install).toBe("2026-06-29");
  });
});

// ── pullPlanBackward ─────────────────────────────────────────────────────────

import { DEFAULT_PHASE_DURATION_DAYS } from "./phases";

describe("pullPlanBackward", () => {
  it("computes all preceding phases from the anchor backward", () => {
    const noPins: PinnedPhases = new Set();
    // Anchor: install = 2026-07-10 (Thu).
    // Durations: install=2, delivery=1, finishing=3, assembly=5, cnc=3, design=5
    const { dates, conflicts } = pullPlanBackward(
      "install",
      "2026-07-10",
      DEFAULT_PHASE_DURATION_DAYS,
      {},
      noPins
    );
    expect(conflicts).toHaveLength(0);
    expect(dates.install).toBe("2026-07-10");
    // delivery = install - duration[install] work days = 2026-07-10 - 2wd = 2026-07-08 (Tue)
    expect(dates.delivery).toBe("2026-07-08");
    // finishing = delivery - duration[delivery] work days = 2026-07-08 - 1wd = 2026-07-07 (Mon)
    expect(dates.finishing).toBe("2026-07-07");
    // assembly = finishing - duration[finishing] work days = 2026-07-07 - 3wd = 2026-07-02 (Thu)
    expect(dates.assembly).toBe("2026-07-02");
    // cnc = assembly - duration[assembly] work days = 2026-07-02 - 5wd = 2026-06-24 (Wed).
    // Canada Day (Wed Jul 1) is a stat holiday, so walking back skips it — the
    // result is one work day earlier than a naive Mon–Fri walk (which gave Jun 25).
    expect(dates.cnc).toBe("2026-06-24");
    // design = cnc - duration[cnc] work days = 2026-06-24 - 3wd = 2026-06-19 (Fri).
    // Shifted from 2026-06-22 because the cnc anchor moved back across Canada Day.
    expect(dates.design).toBe("2026-06-19");
  });

  it("does not change phases after the anchor", () => {
    const noPins: PinnedPhases = new Set();
    const existingDates = { install: "2026-07-10" };
    // anchor is delivery — install is after it.
    const { dates } = pullPlanBackward(
      "delivery",
      "2026-07-08",
      DEFAULT_PHASE_DURATION_DAYS,
      existingDates,
      noPins
    );
    // install is downstream of delivery — unchanged.
    expect(dates.install).toBe("2026-07-10");
    // delivery is set to anchor date.
    expect(dates.delivery).toBe("2026-07-08");
  });

  it("emits conflict when a pinned predecessor would be moved, and uses pinned date", () => {
    const pinned: PinnedPhases = new Set<MilestoneStage>(["delivery"]);
    const currentDates: Partial<Record<MilestoneStage, string>> = {
      delivery: "2026-07-05", // pinned at a different date than what pull-plan would compute
    };
    // install anchor = 2026-07-10, duration[install] = 2 → delivery should be 2026-07-08
    // but delivery is pinned at 2026-07-05 → conflict.
    const { dates, conflicts } = pullPlanBackward(
      "install",
      "2026-07-10",
      DEFAULT_PHASE_DURATION_DAYS,
      currentDates,
      pinned
    );
    expect(conflicts.some((c) => c.phase === "delivery")).toBe(true);
    // delivery is kept at its pinned date.
    expect(dates.delivery).toBe("2026-07-05");
    // install unchanged.
    expect(dates.install).toBe("2026-07-10");
  });

  it("does not conflict when pinned predecessor exactly matches computed date", () => {
    const pinned: PinnedPhases = new Set<MilestoneStage>(["delivery"]);
    // install anchor = 2026-07-10, duration[install] = 2 → delivery should be 2026-07-08
    const currentDates: Partial<Record<MilestoneStage, string>> = {
      delivery: "2026-07-08", // matches computed → no conflict
    };
    const { conflicts } = pullPlanBackward(
      "install",
      "2026-07-10",
      DEFAULT_PHASE_DURATION_DAYS,
      currentDates,
      pinned
    );
    expect(conflicts).toHaveLength(0);
  });
});
