import { describe, it, expect } from "vitest";
import type { Job } from "@shared/lib/types";
import {
  GOOGLE_CALENDAR_SCOPE,
  buildJobCalendarEvents,
  diffCalendarSync,
  type ExistingSyncRow,
} from "./googlePush";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-abc",
    name: "Henderson Kitchen",
    currentMilestone: "cnc",
    installDate: "2026-12-15",
    phaseTargetDates: {
      design: "2026-11-03",
      cnc: "2026-11-17",
      assembly: "2026-12-01",
      finishing: "2026-12-08",
      delivery: "2026-12-12",
      install: "2026-12-15",
    },
    bufferDays: 10,
    ...overrides,
    // The rest of Job is irrelevant to the calendar push; cast through unknown.
  } as unknown as Job;
}

describe("googlePush — minimal scope", () => {
  it("requests only the calendar.events scope (least privilege)", () => {
    expect(GOOGLE_CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.events");
  });
});

describe("buildJobCalendarEvents", () => {
  it("emits one event per phase target plus the committed install", () => {
    const events = buildJobCalendarEvents(makeJob());
    // Six phase targets + one committed-install event.
    const keys = events.map((e) => e.syncKey);
    expect(keys).toContain("job-abc:phase:design");
    expect(keys).toContain("job-abc:phase:install");
    expect(keys).toContain("job-abc:committed-install");
    expect(events.length).toBe(7);
  });

  it("each event carries a stable syncKey, an all-day date, and a job-named summary", () => {
    const events = buildJobCalendarEvents(makeJob());
    const design = events.find((e) => e.syncKey === "job-abc:phase:design")!;
    expect(design.date).toBe("2026-11-03");
    expect(design.summary).toContain("Henderson Kitchen");
    const committed = events.find((e) => e.syncKey === "job-abc:committed-install")!;
    expect(committed.date).toBe("2026-12-15");
    expect(committed.summary.toLowerCase()).toContain("install");
  });

  it("skips phases with no target date", () => {
    const job = makeJob({ phaseTargetDates: { design: "2026-11-03", cnc: "2026-11-17" } });
    const events = buildJobCalendarEvents(job);
    const phaseKeys = events.filter((e) => e.syncKey.includes(":phase:")).map((e) => e.syncKey);
    expect(phaseKeys).toEqual(["job-abc:phase:design", "job-abc:phase:cnc"]);
  });

  it("omits the committed-install event when the job has no install date", () => {
    const job = makeJob({ installDate: "" });
    const events = buildJobCalendarEvents(job);
    expect(events.some((e) => e.syncKey === "job-abc:committed-install")).toBe(false);
  });
});

describe("diffCalendarSync — idempotent upsert", () => {
  const desired = buildJobCalendarEvents(makeJob());

  it("creates every event when nothing exists yet", () => {
    const plan = diffCalendarSync(desired, []);
    expect(plan.toCreate.length).toBe(desired.length);
    expect(plan.toUpdate.length).toBe(0);
    expect(plan.toDelete.length).toBe(0);
  });

  it("is a no-op when the existing mapping already matches (idempotent)", () => {
    const existing: ExistingSyncRow[] = desired.map((e) => ({
      syncKey: e.syncKey,
      googleEventId: `g-${e.syncKey}`,
      syncedDate: e.date,
    }));
    const plan = diffCalendarSync(desired, existing);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("updates only the events whose date moved, carrying the google event id", () => {
    const existing: ExistingSyncRow[] = desired.map((e) => ({
      syncKey: e.syncKey,
      googleEventId: `g-${e.syncKey}`,
      syncedDate: e.syncKey === "job-abc:phase:cnc" ? "2026-11-10" : e.date,
    }));
    const plan = diffCalendarSync(desired, existing);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toUpdate.length).toBe(1);
    expect(plan.toUpdate[0].event.syncKey).toBe("job-abc:phase:cnc");
    expect(plan.toUpdate[0].googleEventId).toBe("g-job-abc:phase:cnc");
  });

  it("deletes orphaned remote events no longer desired (e.g. a phase target removed)", () => {
    const trimmed = buildJobCalendarEvents(makeJob({ phaseTargetDates: { design: "2026-11-03" } }));
    const existing: ExistingSyncRow[] = buildJobCalendarEvents(makeJob()).map((e) => ({
      syncKey: e.syncKey,
      googleEventId: `g-${e.syncKey}`,
      syncedDate: e.date,
    }));
    const plan = diffCalendarSync(trimmed, existing);
    // design + committed-install remain; the other five phase targets are deleted.
    expect(plan.toDelete.map((d) => d.syncKey).sort()).toEqual(
      [
        "job-abc:phase:assembly",
        "job-abc:phase:cnc",
        "job-abc:phase:delivery",
        "job-abc:phase:finishing",
        "job-abc:phase:install",
      ].sort()
    );
    expect(plan.toDelete.every((d) => d.googleEventId.startsWith("g-"))).toBe(true);
  });
});
