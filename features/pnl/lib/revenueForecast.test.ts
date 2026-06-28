/**
 * S24 — P&L revenue forecast unit tests (issue #112).
 *
 * These tests cover the MONEY math in computeRevenueForecast.
 * All monetary assertions use exact integer comparisons (no formatCAD needed
 * in pure functions; formatting is the UI layer's job).
 *
 * Test dates use work days only (Mon–Fri, no BC stat holidays in the window)
 * so the workDaysBetween / addWorkDays calculations are predictable without
 * calendar-knowledge in the assertions.
 */

import { describe, test, expect } from "vitest";
import { computeRevenueForecast } from "./revenueForecast";
import type { Job } from "@shared/lib/types";

// ── Minimal Job stub ─────────────────────────────────────────────────────────

function makeJob(overrides: {
  id: string;
  name: string;
  installDate: string;
  revenue: number;
  internalTargetDate?: string;
  bufferDays?: number;
}): Job {
  return {
    id: overrides.id,
    code: overrides.id,
    name: overrides.name,
    client: "Test Client",
    address: "123 Test St",
    template: "full_project",
    pipelineStatus: "in_production",
    healthStatus: "on_track",
    currentMilestone: "assembly",
    installDate: overrides.installDate,
    revenue: overrides.revenue,
    costs: [],
    invoice: {
      number: "INV-001",
      issuedDate: overrides.installDate,
      dueDate: overrides.installDate,
      lineItems: [],
    },
    internalTargetDate: overrides.internalTargetDate ?? null,
    bufferDays: overrides.bufferDays ?? null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeRevenueForecast — no scheduling data", () => {
  test("jobs without internalTargetDate produce identical hold and slip buckets", () => {
    const jobs = [
      makeJob({ id: "j1", name: "Job 1", installDate: "2026-06-15", revenue: 10_000 }),
      makeJob({ id: "j2", name: "Job 2", installDate: "2026-07-20", revenue: 20_000 }),
    ];
    const today = new Date("2026-06-10T12:00:00.000Z");
    const result = computeRevenueForecast(jobs, today);

    expect(result.buckets).toHaveLength(2);

    const june = result.buckets.find((b) => b.key === "2026-06")!;
    expect(june).toBeDefined();
    expect(june.holdRevenue).toBe(10_000);
    expect(june.slipRevenue).toBe(10_000); // no slip — hold === slip

    const july = result.buckets.find((b) => b.key === "2026-07")!;
    expect(july).toBeDefined();
    expect(july.holdRevenue).toBe(20_000);
    expect(july.slipRevenue).toBe(20_000);
  });

  test("totalRevenue equals sum of all job revenues", () => {
    const jobs = [
      makeJob({ id: "j1", name: "Job 1", installDate: "2026-06-15", revenue: 10_000 }),
      makeJob({ id: "j2", name: "Job 2", installDate: "2026-07-20", revenue: 20_000 }),
    ];
    const result = computeRevenueForecast(jobs, new Date("2026-06-10T12:00:00.000Z"));
    expect(result.totalRevenue).toBe(30_000);
    expect(result.atRiskRevenue).toBe(0);
    expect(result.jobStatuses).toHaveLength(0); // no internalTargetDates
  });

  test("empty job list produces an empty result", () => {
    const result = computeRevenueForecast([], new Date("2026-06-10T12:00:00.000Z"));
    expect(result.buckets).toHaveLength(0);
    expect(result.jobStatuses).toHaveLength(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.atRiskRevenue).toBe(0);
  });
});

describe("computeRevenueForecast — scheduling data, no buffer consumed", () => {
  test("job with internalTargetDate in the future has no buffer consumed → same month", () => {
    // internalTargetDate = 2026-09-01, committedDate = 2026-09-15, today = 2026-08-01
    // today < internalTargetDate → consumedBufferDays = 0 → no slip
    const jobs = [
      makeJob({
        id: "j1",
        name: "Kitchen",
        installDate: "2026-09-15",
        revenue: 50_000,
        internalTargetDate: "2026-09-01",
      }),
    ];
    const today = new Date("2026-08-01T12:00:00.000Z");
    const result = computeRevenueForecast(jobs, today);

    expect(result.buckets).toHaveLength(1);
    const sept = result.buckets[0];
    expect(sept.key).toBe("2026-09");
    expect(sept.holdRevenue).toBe(50_000);
    expect(sept.slipRevenue).toBe(50_000); // no slip

    expect(result.atRiskRevenue).toBe(0);
    expect(result.jobStatuses).toHaveLength(1);
    const status = result.jobStatuses[0];
    expect(status.consumedBufferDays).toBe(0);
    expect(status.bufferConsumedPct).toBe(0);
    expect(status.projectedDate).toBeNull();
    expect(status.slipsToKey).toBeNull();
  });

  test("job with internalTargetDate on today → consumedBufferDays = 0 (boundary: not yet in buffer)", () => {
    // today === internalTargetDate → workDaysBetween("2026-09-01", "2026-09-01") = 0
    const jobs = [
      makeJob({
        id: "j1",
        name: "Bathroom",
        installDate: "2026-09-30",
        revenue: 30_000,
        internalTargetDate: "2026-09-01",
      }),
    ];
    const today = new Date("2026-09-01T12:00:00.000Z");
    const result = computeRevenueForecast(jobs, today);

    const status = result.jobStatuses[0];
    expect(status.consumedBufferDays).toBe(0);
    expect(status.projectedDate).toBeNull();
  });
});

describe("computeRevenueForecast — buffer consumed, same month slip (stays in same month)", () => {
  test("one work-day burn that does not cross month end → projected stays in same month", () => {
    // Use July which has no stat holidays near month-end (BC Day is 1st Mon Aug):
    // installDate = 2026-07-28 (Tue), internalTargetDate = 2026-07-21 (Tue)
    // today = 2026-07-22 (Wed) → consumedBufferDays = workDaysBetween("07-21","07-22") = 1
    // projectedDate = addWorkDays("2026-07-28", 1) = 2026-07-29 (Wed — still July)
    // slipsToKey = null (projected stays in July)
    const jobs = [
      makeJob({
        id: "j1",
        name: "Office",
        installDate: "2026-07-28",
        revenue: 40_000,
        internalTargetDate: "2026-07-21",
      }),
    ];
    const today = new Date("2026-07-22T12:00:00.000Z");
    const result = computeRevenueForecast(jobs, today);

    const status = result.jobStatuses[0];
    expect(status.consumedBufferDays).toBe(1);
    expect(status.projectedDate).not.toBeNull();
    // projectedDate = 2026-07-29 → still in July
    expect(status.projectedDate!.startsWith("2026-07")).toBe(true);
    // slipsToKey is null when the projected date stays in the same month
    expect(status.slipsToKey).toBeNull();

    // Both hold and slip land in July
    expect(result.buckets).toHaveLength(1);
    const july = result.buckets[0];
    expect(july.holdRevenue).toBe(40_000);
    expect(july.slipRevenue).toBe(40_000);

    // Revenue is at risk (consumedBufferDays > 0)
    expect(result.atRiskRevenue).toBe(40_000);
  });
});

describe("computeRevenueForecast — buffer consumed, cross-month slip", () => {
  test("buffer burn that crosses a month boundary shifts revenue to the later month", () => {
    // installDate = 2026-09-30 (September), internalTargetDate = 2026-09-15
    // today = 2026-09-23 → consumedBufferDays = workDaysBetween("2026-09-15", "2026-09-23")
    //   = Tue Sep 16, Wed Sep 17, Thu Sep 18, Fri Sep 19, Mon Sep 22, Tue Sep 23 = 6 work days
    // projectedDate = addWorkDays("2026-09-30", 6)
    //   = Oct 1 (Thu), Oct 2 (Fri) ... Oct 8 (Thu) = 2026-10-08 (6 work days after Sep 30)
    // That's in October → slipsToKey = "2026-10"
    const jobs = [
      makeJob({
        id: "j1",
        name: "Condo Reno",
        installDate: "2026-09-30",
        revenue: 80_000,
        internalTargetDate: "2026-09-15",
      }),
    ];
    const today = new Date("2026-09-23T12:00:00.000Z");
    const result = computeRevenueForecast(jobs, today);

    const status = result.jobStatuses[0];
    expect(status.consumedBufferDays).toBeGreaterThan(0);
    expect(status.projectedDate).not.toBeNull();
    expect(status.slipsToKey).toBe("2026-10"); // revenue slips to October

    // Hold: $80k in September
    const sept = result.buckets.find((b) => b.key === "2026-09")!;
    expect(sept).toBeDefined();
    expect(sept.holdRevenue).toBe(80_000);
    expect(sept.slipRevenue).toBe(0); // job slipped out of September

    // Slip: $80k appears in October
    const oct = result.buckets.find((b) => b.key === "2026-10")!;
    expect(oct).toBeDefined();
    expect(oct.holdRevenue).toBe(0); // no job has October installDate
    expect(oct.slipRevenue).toBe(80_000); // the slipped job lands here

    // Revenue is at risk
    expect(result.atRiskRevenue).toBe(80_000);
  });

  test("mix of slipping and on-track jobs: monthly buckets reflect the difference", () => {
    // Job A: slipping → shifts from June to July
    // Job B: on track → stays in June
    const jobA = makeJob({
      id: "a",
      name: "Slipping Job",
      installDate: "2026-06-30",
      revenue: 60_000,
      internalTargetDate: "2026-06-15",
    });
    const jobB = makeJob({
      id: "b",
      name: "On-Track Job",
      installDate: "2026-06-20",
      revenue: 40_000,
      // no internalTargetDate → always stays in hold bucket
    });

    // today = 2026-06-23:
    // Job A consumed = workDaysBetween("2026-06-15", "2026-06-23") = 6 work days
    // projectedDate = addWorkDays("2026-06-30", 6) → July → slipsToKey = "2026-07"
    const today = new Date("2026-06-23T12:00:00.000Z");
    const result = computeRevenueForecast([jobA, jobB], today);

    const june = result.buckets.find((b) => b.key === "2026-06")!;
    // Hold: both jobs → $60k + $40k = $100k
    expect(june.holdRevenue).toBe(100_000);
    // Slip: only Job B stays in June (Job A slipped to July)
    expect(june.slipRevenue).toBe(40_000);

    const july = result.buckets.find((b) => b.key === "2026-07")!;
    // Hold: no jobs with July installDate
    expect(july.holdRevenue).toBe(0);
    // Slip: Job A slipped in
    expect(july.slipRevenue).toBe(60_000);

    expect(result.totalRevenue).toBe(100_000);
    // Only Job A has consumedBufferDays > 0
    expect(result.atRiskRevenue).toBe(60_000);
  });
});

describe("computeRevenueForecast — buffer burn totals and percentages", () => {
  test("bufferConsumedPct = 0 when today is before internalTargetDate", () => {
    const jobs = [
      makeJob({
        id: "j1",
        name: "Job",
        installDate: "2026-12-31",
        revenue: 100_000,
        internalTargetDate: "2026-12-15",
      }),
    ];
    const result = computeRevenueForecast(jobs, new Date("2026-11-01T12:00:00.000Z"));
    expect(result.jobStatuses[0].bufferConsumedPct).toBe(0);
  });

  test("bufferConsumedPct = 100 when totalBufferDays = 0 but consumedBufferDays > 0", () => {
    // internalTargetDate === installDate → totalBufferDays = 0
    // today is past installDate → consumedBufferDays > 0 → pct = 100
    const jobs = [
      makeJob({
        id: "j1",
        name: "No-Buffer Job",
        installDate: "2026-06-15",
        revenue: 50_000,
        internalTargetDate: "2026-06-15", // same day = 0 buffer
      }),
    ];
    const today = new Date("2026-06-17T12:00:00.000Z"); // past the committed date
    const result = computeRevenueForecast(jobs, today);
    const status = result.jobStatuses[0];
    expect(status.totalBufferDays).toBe(0);
    expect(status.consumedBufferDays).toBeGreaterThan(0);
    expect(status.bufferConsumedPct).toBe(100);
  });

  test("remainingBufferDays is negative when consumed exceeds total", () => {
    // totalBufferDays = workDaysBetween("2026-06-15", "2026-06-22") = 5 work days (Mon-Fri)
    // today = 2026-07-01 → consumedBufferDays = workDaysBetween("2026-06-15", "2026-07-01") = 12 work days
    // remainingBufferDays = 5 - 12 = -7
    const jobs = [
      makeJob({
        id: "j1",
        name: "Overdue Job",
        installDate: "2026-06-22",
        revenue: 25_000,
        internalTargetDate: "2026-06-15",
      }),
    ];
    const result = computeRevenueForecast(jobs, new Date("2026-07-01T12:00:00.000Z"));
    const status = result.jobStatuses[0];
    expect(status.totalBufferDays).toBe(5); // Mon Jun 15 → Mon Jun 22 = 5 work days
    expect(status.remainingBufferDays).toBeLessThan(0);
  });

  test("jobStatuses sorted worst-first by bufferConsumedPct", () => {
    const today = new Date("2026-09-23T12:00:00.000Z");
    const jobs = [
      // Job A: buffer not started
      makeJob({
        id: "a",
        name: "Safe Job",
        installDate: "2026-11-30",
        revenue: 10_000,
        internalTargetDate: "2026-11-15",
      }),
      // Job B: buffer burning (today past internalTargetDate)
      makeJob({
        id: "b",
        name: "Burning Job",
        installDate: "2026-09-30",
        revenue: 20_000,
        internalTargetDate: "2026-09-15",
      }),
    ];
    const result = computeRevenueForecast(jobs, today);

    // Burning Job should be first (worst)
    expect(result.jobStatuses[0].jobId).toBe("b");
    expect(result.jobStatuses[1].jobId).toBe("a");
  });
});

describe("computeRevenueForecast — bucket ordering", () => {
  test("buckets are sorted ascending by calendar month", () => {
    const jobs = [
      makeJob({ id: "j3", name: "Dec Job", installDate: "2026-12-10", revenue: 30_000 }),
      makeJob({ id: "j1", name: "Jun Job", installDate: "2026-06-10", revenue: 10_000 }),
      makeJob({ id: "j2", name: "Sep Job", installDate: "2026-09-10", revenue: 20_000 }),
    ];
    const result = computeRevenueForecast(jobs, new Date("2026-05-01T12:00:00.000Z"));

    const keys = result.buckets.map((b) => b.key);
    expect(keys).toEqual(["2026-06", "2026-09", "2026-12"]);
  });
});

describe("computeRevenueForecast — multiple jobs in same month", () => {
  test("two jobs in same month aggregate correctly on both sides", () => {
    const jobs = [
      makeJob({ id: "j1", name: "Job 1", installDate: "2026-08-10", revenue: 30_000 }),
      makeJob({ id: "j2", name: "Job 2", installDate: "2026-08-25", revenue: 50_000 }),
    ];
    const result = computeRevenueForecast(jobs, new Date("2026-07-01T12:00:00.000Z"));

    expect(result.buckets).toHaveLength(1);
    const aug = result.buckets[0];
    expect(aug.key).toBe("2026-08");
    expect(aug.holdRevenue).toBe(80_000);
    expect(aug.slipRevenue).toBe(80_000);
    expect(aug.holdJobs).toBe(2);
    expect(aug.slipJobs).toBe(2);
  });
});
