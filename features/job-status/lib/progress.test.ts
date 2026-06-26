import { describe, it, expect } from "vitest";
import { phaseProgress, jobProgress } from "./progress";
import type { TrackableItem } from "./types";

const make = (overrides: Partial<TrackableItem> = {}): TrackableItem => ({
  id: "i-1",
  jobId: "job-a",
  phase: "assembly",
  label: "Step",
  done: false,
  kind: "job_item",
  sortOrder: 0,
  ...overrides,
});

describe("phaseProgress", () => {
  it("returns 0 when the items list is empty", () => {
    expect(phaseProgress([], "assembly")).toBe(0);
  });

  it("returns 0 when the phase has no items (other phases present)", () => {
    expect(phaseProgress([make({ phase: "cnc" })], "assembly")).toBe(0);
  });

  it("returns 0 when no items in the phase are done", () => {
    const items = [make({ done: false }), make({ id: "2", done: false })];
    expect(phaseProgress(items, "assembly")).toBe(0);
  });

  it("returns 1 when all items in the phase are done", () => {
    const items = [make({ done: true }), make({ id: "2", done: true })];
    expect(phaseProgress(items, "assembly")).toBe(1);
  });

  it("returns 0.5 when exactly half are done", () => {
    const items = [make({ done: true }), make({ id: "2", done: false })];
    expect(phaseProgress(items, "assembly")).toBe(0.5);
  });

  it("only counts items in the requested phase", () => {
    const items = [
      make({ id: "1", phase: "assembly", done: true }),
      make({ id: "2", phase: "cnc", done: false }),
    ];
    expect(phaseProgress(items, "assembly")).toBe(1);
    expect(phaseProgress(items, "cnc")).toBe(0);
  });

  it("handles a single done item", () => {
    expect(phaseProgress([make({ done: true })], "assembly")).toBe(1);
  });
});

describe("jobProgress", () => {
  it("returns 0 for an empty list", () => {
    expect(jobProgress([])).toBe(0);
  });

  it("returns 0 when nothing is done", () => {
    expect(jobProgress([make(), make({ id: "2" })])).toBe(0);
  });

  it("returns 1 when everything is done", () => {
    expect(jobProgress([make({ done: true }), make({ id: "2", done: true })])).toBe(1);
  });

  it("returns the fraction done across all phases", () => {
    const items = [
      make({ id: "1", phase: "design", done: true }),
      make({ id: "2", phase: "assembly", done: false }),
      make({ id: "3", phase: "cnc", done: true }),
      make({ id: "4", phase: "finishing", done: false }),
    ];
    expect(jobProgress(items)).toBe(0.5);
  });

  it("handles a single done item", () => {
    expect(jobProgress([make({ done: true })])).toBe(1);
  });

  it("handles a single not-done item", () => {
    expect(jobProgress([make({ done: false })])).toBe(0);
  });
});
