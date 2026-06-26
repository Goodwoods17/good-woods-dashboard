import { describe, it, expect } from "vitest";
import { toTrackableItems } from "./adapter";
import type { JobItem } from "./types";

const base: JobItem = {
  id: "ji-1",
  jobId: "job-abc",
  phase: "assembly",
  label: "Glue up carcass",
  source: "template",
  templateId: "t-1",
  status: "not_started",
  visibility: "owner",
  sortOrder: 10,
  statusUpdatedAt: null,
  statusUpdatedBy: null,
  createdAt: "2026-06-28T00:00:00Z",
};

describe("toTrackableItems", () => {
  it("returns an empty array for empty input", () => {
    expect(toTrackableItems([])).toEqual([]);
  });

  it("maps a job_item to a TrackableItem with kind='job_item'", () => {
    const [t] = toTrackableItems([base]);
    expect(t.id).toBe("ji-1");
    expect(t.jobId).toBe("job-abc");
    expect(t.phase).toBe("assembly");
    expect(t.label).toBe("Glue up carcass");
    expect(t.kind).toBe("job_item");
    expect(t.sortOrder).toBe(10);
  });

  it("normalises done=false for not_started", () => {
    const [t] = toTrackableItems([{ ...base, status: "not_started" }]);
    expect(t.done).toBe(false);
  });

  it("normalises done=false for in_progress", () => {
    const [t] = toTrackableItems([{ ...base, status: "in_progress" }]);
    expect(t.done).toBe(false);
  });

  it("normalises done=false for blocked", () => {
    const [t] = toTrackableItems([{ ...base, status: "blocked" }]);
    expect(t.done).toBe(false);
  });

  it("normalises done=true only for status 'done'", () => {
    const [t] = toTrackableItems([{ ...base, status: "done" }]);
    expect(t.done).toBe(true);
  });

  it("handles multiple items preserving each sortOrder", () => {
    const items = [
      { ...base, id: "a", sortOrder: 20 },
      { ...base, id: "b", sortOrder: 5 },
    ];
    const [a, b] = toTrackableItems(items);
    expect(a.sortOrder).toBe(20);
    expect(b.sortOrder).toBe(5);
  });

  it("maps across different phases correctly", () => {
    const items = [
      { ...base, id: "x", phase: "design" as const },
      { ...base, id: "y", phase: "finishing" as const },
    ];
    const [x, y] = toTrackableItems(items);
    expect(x.phase).toBe("design");
    expect(y.phase).toBe("finishing");
  });
});
