import { describe, it, expect } from "vitest";
import {
  sortWithPriority,
  computeBumpImpact,
  buildPriorityBumpRecord,
} from "./priorityBump";

// ─── sortWithPriority ─────────────────────────────────────────────────────────

describe("sortWithPriority — zone ordering unchanged", () => {
  it("red beats green regardless of priority", () => {
    const entries = [
      { job: { isPriority: false }, zone: "green", bufferConsumedPct: 5 },
      { job: { isPriority: false }, zone: "red", bufferConsumedPct: 80 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted[0].zone).toBe("red");
    expect(sorted[1].zone).toBe("green");
  });

  it("red beats yellow beats green beats unscheduled", () => {
    const entries = [
      { job: { isPriority: false }, zone: "green", bufferConsumedPct: 5 },
      { job: { isPriority: false }, zone: null, bufferConsumedPct: 0 },
      { job: { isPriority: false }, zone: "yellow", bufferConsumedPct: 40 },
      { job: { isPriority: false }, zone: "red", bufferConsumedPct: 90 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted.map((e) => e.zone)).toEqual(["red", "yellow", "green", null]);
  });
});

describe("sortWithPriority — priority wins ties within zone", () => {
  it("priority job floats first within the same zone", () => {
    const entries = [
      { job: { isPriority: false }, zone: "green", bufferConsumedPct: 30 },
      { job: { isPriority: true }, zone: "green", bufferConsumedPct: 10 },
    ];
    const sorted = sortWithPriority(entries);
    // Priority job is first even though it has LOWER bufferConsumedPct
    expect(sorted[0].job.isPriority).toBe(true);
    expect(sorted[1].job.isPriority).toBe(false);
  });

  it("two priority jobs in same zone: higher bufferConsumedPct first", () => {
    const entries = [
      { job: { isPriority: true }, zone: "yellow", bufferConsumedPct: 30 },
      { job: { isPriority: true }, zone: "yellow", bufferConsumedPct: 55 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted[0].bufferConsumedPct).toBe(55);
    expect(sorted[1].bufferConsumedPct).toBe(30);
  });

  it("two non-priority jobs in same zone: higher bufferConsumedPct first", () => {
    const entries = [
      { job: { isPriority: false }, zone: "red", bufferConsumedPct: 60 },
      { job: { isPriority: false }, zone: "red", bufferConsumedPct: 95 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted[0].bufferConsumedPct).toBe(95);
    expect(sorted[1].bufferConsumedPct).toBe(60);
  });

  it("priority green job floats above non-priority red job — zone wins", () => {
    // Priority only wins TIES (same zone). A red non-priority job still beats
    // a green priority job because zone rank is more severe.
    const entries = [
      { job: { isPriority: true }, zone: "green", bufferConsumedPct: 5 },
      { job: { isPriority: false }, zone: "red", bufferConsumedPct: 80 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted[0].zone).toBe("red"); // red still wins
    expect(sorted[1].zone).toBe("green");
  });

  it("priority unscheduled job floats before non-priority unscheduled", () => {
    const entries = [
      { job: { isPriority: false }, zone: null, bufferConsumedPct: 0 },
      { job: { isPriority: true }, zone: null, bufferConsumedPct: 0 },
    ];
    const sorted = sortWithPriority(entries);
    expect(sorted[0].job.isPriority).toBe(true);
    expect(sorted[1].job.isPriority).toBe(false);
  });

  it("does not mutate the original array", () => {
    const entries = [
      { job: { isPriority: false }, zone: "green", bufferConsumedPct: 5 },
      { job: { isPriority: true }, zone: "green", bufferConsumedPct: 5 },
    ];
    const original = [...entries];
    sortWithPriority(entries);
    expect(entries[0].job.isPriority).toBe(original[0].job.isPriority);
  });
});

// ─── computeBumpImpact ────────────────────────────────────────────────────────

describe("computeBumpImpact — message format", () => {
  it("generates the spec message format: 'pushing X Nd protects Y → X committed date moves to Mmm D, YYYY, needs re-commit + client message'", () => {
    const preview = computeBumpImpact({
      priorityJob: { id: "job-saywell", name: "Saywell" },
      bumpedJob: { id: "job-henderson", name: "Henderson", installDate: "2026-03-10" },
      bumpDays: 4,
    });

    // Message must name both jobs and state the need for a re-commit.
    expect(preview.message).toContain("pushing Henderson 4d protects Saywell");
    expect(preview.message).toContain("Henderson committed date moves to");
    expect(preview.message).toContain("needs re-commit + client message");
  });

  it("sets bumpedJobName, priorityJobName, bumpDays, oldCommittedDate", () => {
    const preview = computeBumpImpact({
      priorityJob: { id: "p1", name: "VIP Project" },
      bumpedJob: { id: "b1", name: "Regular Job", installDate: "2026-06-01" },
      bumpDays: 7,
    });

    expect(preview.bumpedJobName).toBe("Regular Job");
    expect(preview.priorityJobName).toBe("VIP Project");
    expect(preview.bumpDays).toBe(7);
    expect(preview.oldCommittedDate).toBe("2026-06-01");
  });

  it("newCommittedDate is N work days after the old committed date (skips weekends)", () => {
    // 2026-06-01 is a Monday. 4 work days later = 2026-06-05 (Friday).
    const preview = computeBumpImpact({
      priorityJob: { id: "p", name: "P" },
      bumpedJob: { id: "b", name: "B", installDate: "2026-06-01" },
      bumpDays: 4,
    });
    expect(preview.newCommittedDate).toBe("2026-06-05");
  });

  it("clamps bumpDays to minimum 1", () => {
    const preview = computeBumpImpact({
      priorityJob: { id: "p", name: "P" },
      bumpedJob: { id: "b", name: "B", installDate: "2026-06-01" },
      bumpDays: 0,
    });
    expect(preview.bumpDays).toBe(1);
  });

  it("newCommittedDate skips weekend: Thursday + 2 work days = Monday", () => {
    // 2026-06-04 is a Thursday. +2 work days = Friday(1) → Monday(2) = 2026-06-08.
    const preview = computeBumpImpact({
      priorityJob: { id: "p", name: "P" },
      bumpedJob: { id: "b", name: "B", installDate: "2026-06-04" },
      bumpDays: 2,
    });
    expect(preview.newCommittedDate).toBe("2026-06-08");
  });
});

// ─── buildPriorityBumpRecord ──────────────────────────────────────────────────

describe("buildPriorityBumpRecord", () => {
  it("round-trips all input fields", () => {
    const record = buildPriorityBumpRecord({
      priorityJobId: "job-a",
      bumpedJobId: "job-b",
      bumpDays: 3,
      reason: "Kitchen remodel must ship before holidays",
      oldCommittedDate: "2026-06-01",
      newCommittedDate: "2026-06-04",
      bumpedBy: "andrew@test.local",
      bumpedAt: "2026-06-27T09:00:00.000Z",
    });

    expect(record.priorityJobId).toBe("job-a");
    expect(record.bumpedJobId).toBe("job-b");
    expect(record.bumpDays).toBe(3);
    expect(record.reason).toBe("Kitchen remodel must ship before holidays");
    expect(record.oldCommittedDate).toBe("2026-06-01");
    expect(record.newCommittedDate).toBe("2026-06-04");
    expect(record.bumpedBy).toBe("andrew@test.local");
    expect(record.bumpedAt).toBe("2026-06-27T09:00:00.000Z");
  });

  it("defaults bumpedBy to null and bumpedAt to now when not provided", () => {
    const before = Date.now();
    const record = buildPriorityBumpRecord({
      priorityJobId: "p",
      bumpedJobId: "b",
      bumpDays: 1,
      reason: "test",
      oldCommittedDate: null,
      newCommittedDate: "2026-07-01",
    });
    const after = Date.now();

    expect(record.bumpedBy).toBeNull();
    // bumpedAt should be an ISO string between before and after.
    const ts = Date.parse(record.bumpedAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("generates a non-empty id", () => {
    const record = buildPriorityBumpRecord({
      priorityJobId: "p",
      bumpedJobId: "b",
      bumpDays: 2,
      reason: "r",
      oldCommittedDate: null,
      newCommittedDate: "2026-08-01",
    });
    expect(record.id).toBeTruthy();
    expect(typeof record.id).toBe("string");
  });

  it("two records get different ids", () => {
    const make = () =>
      buildPriorityBumpRecord({
        priorityJobId: "p",
        bumpedJobId: "b",
        bumpDays: 1,
        reason: "r",
        oldCommittedDate: null,
        newCommittedDate: "2026-08-01",
      });
    expect(make().id).not.toBe(make().id);
  });
});
