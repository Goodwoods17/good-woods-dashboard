import { describe, it, expect } from "vitest";
import { groupItemsByJob, isActiveJob } from "./boardStore";
import type { TrackableItem } from "./types";
import type { Job } from "@shared/lib/types";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const makeItem = (overrides: Partial<TrackableItem> = {}): TrackableItem => ({
  id: "i-1",
  jobId: "job-a",
  phase: "assembly",
  label: "Step",
  done: false,
  kind: "job_item",
  sortOrder: 0,
  ...overrides,
});

const makeJob = (pipelineStatus: Job["pipelineStatus"]): Job => ({
  id: "j-1",
  code: "GW-001",
  name: "Test Job",
  client: "Client",
  address: "123 Main St",
  template: "full_project",
  pipelineStatus,
  healthStatus: "on_track",
  currentMilestone: "design",
  installDate: "2026-12-01",
  revenue: 10000,
  costs: [],
  invoice: {
    number: "INV-001",
    issuedDate: "2026-01-01",
    dueDate: "2026-01-15",
    lineItems: [],
  },
});

// ─── groupItemsByJob ──────────────────────────────────────────────────────────

describe("groupItemsByJob", () => {
  it("returns an empty map for empty input", () => {
    expect(groupItemsByJob([])).toEqual(new Map());
  });

  it("groups a single item under its jobId", () => {
    const item = makeItem({ jobId: "job-1" });
    const result = groupItemsByJob([item]);
    expect(result.get("job-1")).toEqual([item]);
    expect(result.size).toBe(1);
  });

  it("groups multiple items for the same job", () => {
    const items = [makeItem({ id: "a", jobId: "job-1" }), makeItem({ id: "b", jobId: "job-1" })];
    const result = groupItemsByJob(items);
    expect(result.get("job-1")).toHaveLength(2);
  });

  it("separates items from different jobs", () => {
    const items = [makeItem({ id: "a", jobId: "job-1" }), makeItem({ id: "b", jobId: "job-2" })];
    const result = groupItemsByJob(items);
    expect(result.get("job-1")).toHaveLength(1);
    expect(result.get("job-2")).toHaveLength(1);
    expect(result.size).toBe(2);
  });

  it("handles mixed kinds (job_item and piece) in the same job", () => {
    const items = [
      makeItem({ id: "a", jobId: "job-1", kind: "job_item" }),
      makeItem({ id: "b", jobId: "job-1", kind: "piece" }),
    ];
    const result = groupItemsByJob(items);
    expect(result.get("job-1")).toHaveLength(2);
  });

  it("preserves insertion order within each job group", () => {
    const items = [
      makeItem({ id: "z", jobId: "job-1", sortOrder: 2 }),
      makeItem({ id: "a", jobId: "job-1", sortOrder: 1 }),
    ];
    const result = groupItemsByJob(items);
    const grouped = result.get("job-1")!;
    expect(grouped[0].id).toBe("z");
    expect(grouped[1].id).toBe("a");
  });

  it("handles three jobs with different item counts", () => {
    const items = [
      makeItem({ id: "1", jobId: "job-a" }),
      makeItem({ id: "2", jobId: "job-b" }),
      makeItem({ id: "3", jobId: "job-b" }),
      makeItem({ id: "4", jobId: "job-c" }),
      makeItem({ id: "5", jobId: "job-c" }),
      makeItem({ id: "6", jobId: "job-c" }),
    ];
    const result = groupItemsByJob(items);
    expect(result.get("job-a")).toHaveLength(1);
    expect(result.get("job-b")).toHaveLength(2);
    expect(result.get("job-c")).toHaveLength(3);
  });
});

// ─── isActiveJob ─────────────────────────────────────────────────────────────

describe("isActiveJob", () => {
  it("returns false for complete jobs", () => {
    expect(isActiveJob(makeJob("complete"))).toBe(false);
  });

  it("returns true for 'new' jobs", () => {
    expect(isActiveJob(makeJob("new"))).toBe(true);
  });

  it("returns true for 'sold' jobs", () => {
    expect(isActiveJob(makeJob("sold"))).toBe(true);
  });

  it("returns true for 'in_design' jobs", () => {
    expect(isActiveJob(makeJob("in_design"))).toBe(true);
  });

  it("returns true for 'in_production' jobs", () => {
    expect(isActiveJob(makeJob("in_production"))).toBe(true);
  });

  it("returns true for 'in_finishing' jobs", () => {
    expect(isActiveJob(makeJob("in_finishing"))).toBe(true);
  });

  it("returns true for 'installing' jobs", () => {
    expect(isActiveJob(makeJob("installing"))).toBe(true);
  });
});
