import { describe, it, expect } from "vitest";
import { buildScheduleOverview } from "./scheduleOverview";
import type { Job } from "@shared/lib/types";

const baseJob = (overrides: Partial<Job> = {}): Job =>
  ({
    id: "job-1",
    code: "GW-1",
    name: "Test Job",
    client: "Client",
    address: "1 Way",
    template: "full_project",
    pipelineStatus: "in_production",
    healthStatus: "on_track",
    currentMilestone: "assembly",
    installDate: "2026-12-15",
    revenue: 0,
    costs: [],
    invoice: { number: "", issuedDate: "", dueDate: "", lineItems: [] },
    ...overrides,
  }) as Job;

describe("buildScheduleOverview", () => {
  it("returns on_track status when no phase targets exist", () => {
    const overview = buildScheduleOverview(baseJob(), new Date("2026-09-01"));
    expect(overview.status).toBe("on_track");
  });

  it("returns behind status when current-phase target is in the past", () => {
    const job = baseJob({
      currentMilestone: "assembly",
      phaseTargetDates: { assembly: "2026-07-01" },
    });
    const overview = buildScheduleOverview(job, new Date("2026-09-01"));
    expect(overview.status).toBe("behind");
  });

  it("returns on_track status when current-phase target is in the future", () => {
    const job = baseJob({
      currentMilestone: "assembly",
      phaseTargetDates: { assembly: "2026-12-01" },
    });
    const overview = buildScheduleOverview(job, new Date("2026-09-01"));
    expect(overview.status).toBe("on_track");
  });

  it("exposes the committed install date from jobs.installDate", () => {
    const overview = buildScheduleOverview(baseJob({ installDate: "2026-12-15" }), new Date());
    expect(overview.committedInstall).toBe("2026-12-15");
  });

  it("exposes internalTarget as null when not set", () => {
    const overview = buildScheduleOverview(baseJob(), new Date());
    expect(overview.internalTarget).toBeNull();
  });

  it("exposes internalTarget when set on the job", () => {
    const job = baseJob({ internalTargetDate: "2026-12-01" });
    const overview = buildScheduleOverview(job, new Date());
    expect(overview.internalTarget).toBe("2026-12-01");
  });

  it("exposes bufferDays as 0 when not set", () => {
    const overview = buildScheduleOverview(baseJob(), new Date());
    expect(overview.bufferDays).toBe(0);
  });

  it("exposes bufferDays from the job when set", () => {
    const job = baseJob({ bufferDays: 10 });
    const overview = buildScheduleOverview(job, new Date());
    expect(overview.bufferDays).toBe(10);
  });

  it("exposes phaseCount — total phases and how many are complete", () => {
    // currentMilestone 'assembly' (index 2) → 2 phases done (design, cnc), 4 remaining
    const job = baseJob({ currentMilestone: "assembly" });
    const overview = buildScheduleOverview(job, new Date());
    expect(overview.phasesComplete).toBe(2);
    expect(overview.phasesTotal).toBe(6);
  });

  it("phasesComplete is 0 when on the first phase", () => {
    const job = baseJob({ currentMilestone: "design" });
    const overview = buildScheduleOverview(job, new Date());
    expect(overview.phasesComplete).toBe(0);
  });

  it("phasesComplete is 5 when on the last phase (install)", () => {
    const job = baseJob({ currentMilestone: "install" });
    const overview = buildScheduleOverview(job, new Date());
    expect(overview.phasesComplete).toBe(5);
  });
});
