import { describe, it, expect } from "vitest";
import { toTrackableItems, piecesToTrackableItems, pieceToPhase, isPieceDone } from "./adapter";
import type { JobPiece } from "@shared/lib/types";
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

// ─── pieceToPhase ──────────────────────────────────────────────────────────────

describe("pieceToPhase", () => {
  it("maps 'installed' to install phase", () => {
    expect(pieceToPhase("installed")).toBe("install");
  });
  it("maps 'final_adjustments' to install phase", () => {
    expect(pieceToPhase("final_adjustments")).toBe("install");
  });
  it("maps terminal 'done' to install phase", () => {
    expect(pieceToPhase("done")).toBe("install");
  });
  it("maps 'not_started' to delivery phase", () => {
    expect(pieceToPhase("not_started")).toBe("delivery");
  });
  it("maps 'cut' to delivery phase", () => {
    expect(pieceToPhase("cut")).toBe("delivery");
  });
  it("maps 'packed' to delivery phase", () => {
    expect(pieceToPhase("packed")).toBe("delivery");
  });
  it("maps 'delivered' to delivery phase", () => {
    expect(pieceToPhase("delivered")).toBe("delivery");
  });
});

// ─── isPieceDone ───────────────────────────────────────────────────────────────

describe("isPieceDone", () => {
  it("returns true for terminal status 'done'", () => {
    expect(isPieceDone("done")).toBe(true);
  });
  it("returns false for 'not_started'", () => {
    expect(isPieceDone("not_started")).toBe(false);
  });
  it("returns false for 'installed' (not yet terminal)", () => {
    expect(isPieceDone("installed")).toBe(false);
  });
  it("returns false for any intermediate status", () => {
    expect(isPieceDone("cut")).toBe(false);
    expect(isPieceDone("delivered")).toBe(false);
    expect(isPieceDone("packed")).toBe(false);
  });
});

// ─── piecesToTrackableItems ────────────────────────────────────────────────────

const basePiece: JobPiece = {
  id: "p-1",
  projectId: "job-abc",
  kind: "cabinet",
  label: "Kitchen island base",
  status: "not_started",
  source: "manual",
  sortOrder: 5,
  createdAt: "2026-06-28T00:00:00Z",
};

describe("piecesToTrackableItems", () => {
  it("returns an empty array for empty input", () => {
    expect(piecesToTrackableItems([])).toEqual([]);
  });

  it("maps a piece with kind='piece'", () => {
    const [t] = piecesToTrackableItems([basePiece]);
    expect(t.kind).toBe("piece");
  });

  it("uses projectId as jobId (projectId==jobId in this codebase)", () => {
    const [t] = piecesToTrackableItems([basePiece]);
    expect(t.jobId).toBe("job-abc");
  });

  it("maps id and label", () => {
    const [t] = piecesToTrackableItems([basePiece]);
    expect(t.id).toBe("p-1");
    expect(t.label).toBe("Kitchen island base");
  });

  it("maps sortOrder", () => {
    const [t] = piecesToTrackableItems([basePiece]);
    expect(t.sortOrder).toBe(5);
  });

  it("assigns delivery phase for not_started status", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "not_started" }]);
    expect(t.phase).toBe("delivery");
  });

  it("assigns delivery phase for production statuses (cut, packed, delivered)", () => {
    for (const status of ["cut", "assembled", "packed", "delivered"]) {
      const [t] = piecesToTrackableItems([{ ...basePiece, status }]);
      expect(t.phase).toBe("delivery");
    }
  });

  it("assigns install phase for installed status", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "installed" }]);
    expect(t.phase).toBe("install");
  });

  it("assigns install phase for final_adjustments status", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "final_adjustments" }]);
    expect(t.phase).toBe("install");
  });

  it("normalises done=false for not_started", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "not_started" }]);
    expect(t.done).toBe(false);
  });

  it("normalises done=false for intermediate statuses (installed is not terminal)", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "installed" }]);
    expect(t.done).toBe(false);
  });

  it("normalises done=true only at terminal status 'done'", () => {
    const [t] = piecesToTrackableItems([{ ...basePiece, status: "done" }]);
    expect(t.done).toBe(true);
  });

  it("handles multiple pieces preserving order", () => {
    const pieces = [
      { ...basePiece, id: "a", sortOrder: 2 },
      { ...basePiece, id: "b", sortOrder: 1 },
    ];
    const [a, b] = piecesToTrackableItems(pieces);
    expect(a.sortOrder).toBe(2);
    expect(b.sortOrder).toBe(1);
  });
});
