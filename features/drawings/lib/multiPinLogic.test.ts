import { describe, it, expect } from "vitest";
import type { JobPiecePin } from "@shared/lib/types";
import {
  isPinnedOnDocument,
  buildSetPrimaryPatches,
  PIN_ROLE_LABELS,
  PIN_ROLES,
} from "./multiPinLogic";

let _idSeq = 0;
function mkPin(overrides: Partial<JobPiecePin> = {}): JobPiecePin {
  _idSeq++;
  return {
    id: `pin${_idSeq}`,
    jobPieceId: "piece-1",
    documentId: "doc-1",
    isPrimary: false,
    createdAt: "2026-06-30T00:00:00Z",
    ...overrides,
  };
}

// ─── isPinnedOnDocument ────────────────────────────────────────────────────

describe("isPinnedOnDocument", () => {
  it("returns true when piece has a pin on the given document", () => {
    const pins = [mkPin({ jobPieceId: "p1", documentId: "d1", isPrimary: true })];
    expect(isPinnedOnDocument(pins, "p1", "d1")).toBe(true);
  });

  it("returns false when piece has no pin on the given document", () => {
    const pins = [mkPin({ jobPieceId: "p1", documentId: "d2", isPrimary: true })];
    expect(isPinnedOnDocument(pins, "p1", "d1")).toBe(false);
  });

  it("returns false for an empty pin list", () => {
    expect(isPinnedOnDocument([], "p1", "d1")).toBe(false);
  });

  it("ignores pins for other pieces even if they are on the same document", () => {
    const pins = [mkPin({ jobPieceId: "p2", documentId: "d1", isPrimary: true })];
    expect(isPinnedOnDocument(pins, "p1", "d1")).toBe(false);
  });

  it("returns true even for a secondary (non-primary) pin", () => {
    const pins = [mkPin({ jobPieceId: "p1", documentId: "d1", isPrimary: false })];
    expect(isPinnedOnDocument(pins, "p1", "d1")).toBe(true);
  });
});

// ─── buildSetPrimaryPatches ────────────────────────────────────────────────

describe("buildSetPrimaryPatches", () => {
  it("returns empty array when the target pin is already primary", () => {
    const pin = mkPin({ id: "pa", jobPieceId: "p1", isPrimary: true });
    expect(buildSetPrimaryPatches([pin], "pa")).toHaveLength(0);
  });

  it("returns empty array when pin id is not found", () => {
    const pin = mkPin({ id: "pa", jobPieceId: "p1", isPrimary: true });
    expect(buildSetPrimaryPatches([pin], "missing")).toHaveLength(0);
  });

  it("promotes the target pin and demotes the old primary", () => {
    const primary = mkPin({ id: "pa", jobPieceId: "p1", documentId: "d1", isPrimary: true });
    const secondary = mkPin({ id: "pb", jobPieceId: "p1", documentId: "d2", isPrimary: false });
    const patches = buildSetPrimaryPatches([primary, secondary], "pb");
    expect(patches).toHaveLength(2);
    const pA = patches.find((x) => x.id === "pa");
    const pB = patches.find((x) => x.id === "pb");
    expect(pA?.patch.isPrimary).toBe(false);
    expect(pB?.patch.isPrimary).toBe(true);
  });

  it("handles multiple secondary pins — only promotes the target", () => {
    const prim = mkPin({ id: "pa", jobPieceId: "p1", documentId: "d1", isPrimary: true });
    const sec1 = mkPin({ id: "pb", jobPieceId: "p1", documentId: "d2", isPrimary: false });
    const sec2 = mkPin({ id: "pc", jobPieceId: "p1", documentId: "d3", isPrimary: false });
    const patches = buildSetPrimaryPatches([prim, sec1, sec2], "pc");
    expect(patches).toHaveLength(3);
    expect(patches.find((x) => x.id === "pa")?.patch.isPrimary).toBe(false);
    expect(patches.find((x) => x.id === "pb")?.patch.isPrimary).toBe(false);
    expect(patches.find((x) => x.id === "pc")?.patch.isPrimary).toBe(true);
  });

  it("does not include patches for pins that belong to other pieces", () => {
    const p1prim = mkPin({ id: "pa", jobPieceId: "p1", documentId: "d1", isPrimary: true });
    const p1sec = mkPin({ id: "pb", jobPieceId: "p1", documentId: "d2", isPrimary: false });
    const p2pin = mkPin({ id: "pc", jobPieceId: "p2", documentId: "d1", isPrimary: true });
    const patches = buildSetPrimaryPatches([p1prim, p1sec, p2pin], "pb");
    const ids = patches.map((x) => x.id);
    expect(ids).not.toContain("pc");
  });
});

// ─── constants ────────────────────────────────────────────────────────────

describe("PIN_ROLE_LABELS", () => {
  it("has a label for every role in PIN_ROLES", () => {
    for (const role of PIN_ROLES) {
      expect(PIN_ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("covers the five canonical roles", () => {
    expect(Object.keys(PIN_ROLE_LABELS).sort()).toEqual(
      ["detail", "elevation", "other", "plan", "section"]
    );
  });
});
