import { describe, it, expect } from "vitest";
import { scheduleStatus, bufferDaysFor, committedDate, type PhaseTargetDates } from "./schedule";
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
    installDate: "2026-12-01",
    revenue: 0,
    costs: [],
    invoice: { number: "", issuedDate: "", dueDate: "", lineItems: [] },
    ...overrides,
  }) as Job;

// `scheduleStatus` is the basic on-track / behind badge derived ONLY from the
// current-milestone pointer vs. the current phase's internal target date.
describe("scheduleStatus", () => {
  const targets: PhaseTargetDates = {
    design: "2026-06-01",
    cnc: "2026-07-01",
    assembly: "2026-08-01",
  };

  it("is on_track when no per-phase targets are set (nothing can be overdue)", () => {
    expect(scheduleStatus("assembly", undefined, new Date("2026-09-01"))).toBe("on_track");
    expect(scheduleStatus("assembly", {}, new Date("2026-09-01"))).toBe("on_track");
  });

  it("is on_track when the current phase target is in the future", () => {
    expect(scheduleStatus("assembly", targets, new Date("2026-07-15"))).toBe("on_track");
  });

  it("is behind when today is strictly past the current phase target", () => {
    expect(scheduleStatus("assembly", targets, new Date("2026-08-02"))).toBe("behind");
  });

  it("is on_track on the target date itself (not strictly after)", () => {
    expect(scheduleStatus("assembly", targets, new Date("2026-08-01"))).toBe("on_track");
  });

  it("only considers the CURRENT phase target, not earlier overdue phases", () => {
    // design + cnc targets are long past, but the current phase (assembly) is in
    // the future → still on track. Past phases are assumed complete.
    expect(scheduleStatus("assembly", targets, new Date("2026-07-15"))).toBe("on_track");
  });

  it("is on_track when the current phase has no target even if others do", () => {
    expect(scheduleStatus("install", targets, new Date("2026-12-31"))).toBe("on_track");
  });

  // Boundary equivalence after folding onto compareToTarget: the flip happens
  // strictly AFTER the target day ends (yesterday/today/tomorrow of the target),
  // including at the extreme instants of the target day.
  describe("boundary equivalence (yesterday / today / tomorrow)", () => {
    const t: PhaseTargetDates = { assembly: "2026-08-01" };
    it("day before target → on_track", () => {
      expect(scheduleStatus("assembly", t, new Date("2026-07-31T12:00:00Z"))).toBe("on_track");
    });
    it("first and last instant of the target day → on_track", () => {
      expect(scheduleStatus("assembly", t, new Date("2026-08-01T00:00:00.000Z"))).toBe("on_track");
      expect(scheduleStatus("assembly", t, new Date("2026-08-01T23:59:59.999Z"))).toBe("on_track");
    });
    it("first instant of the day after target → behind", () => {
      expect(scheduleStatus("assembly", t, new Date("2026-08-02T00:00:00.000Z"))).toBe("behind");
    });
  });
});

describe("committedDate", () => {
  it("is the unchanged client-committed install_date", () => {
    expect(committedDate(baseJob({ installDate: "2026-12-01" }))).toBe("2026-12-01");
  });
});

describe("bufferDaysFor", () => {
  it("returns the stored pooled buffer", () => {
    expect(bufferDaysFor(baseJob({ bufferDays: 7 }))).toBe(7);
  });

  it("defaults to 0 when no buffer is set", () => {
    expect(bufferDaysFor(baseJob())).toBe(0);
  });
});
