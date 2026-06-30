import { describe, it, expect } from "vitest";
import type { ProjectDocument } from "@shared/lib/types";
import { buildRevisionChain, hasRevisionHistory } from "./documentRevision";

function doc(over: Partial<ProjectDocument>): ProjectDocument {
  return {
    id: "d1",
    projectId: "j1",
    kind: "designer",
    label: "Kitchen elevations",
    driveUrl: null,
    version: "R1",
    isCurrent: true,
    notes: null,
    uploadedBy: null,
    createdAt: "2026-06-23T00:00:00Z",
    source: "upload",
    storagePath: "j1/d1.pdf",
    mime: "application/pdf",
    pageCount: 3,
    supersedesId: null,
    ...over,
  };
}

const REV_A = doc({ id: "rev-a", version: "R1", isCurrent: false, supersedesId: null, createdAt: "2026-06-01T00:00:00Z" });
const REV_B = doc({ id: "rev-b", version: "R2", isCurrent: true,  supersedesId: "rev-a", createdAt: "2026-06-10T00:00:00Z" });
const REV_C = doc({ id: "rev-c", version: "R3", isCurrent: true,  supersedesId: "rev-b", createdAt: "2026-06-20T00:00:00Z" });
const UNRELATED = doc({ id: "unrelated", kind: "permit", label: "Permit application", version: "v1", isCurrent: true, supersedesId: null });

describe("buildRevisionChain — resolves the full lineage in chronological order", () => {
  it("returns a singleton for a doc with no revision linkage", () => {
    const chain = buildRevisionChain(UNRELATED, [UNRELATED]);
    expect(chain.map((d) => d.id)).toEqual(["unrelated"]);
  });

  it("returns both revisions when two docs are linked", () => {
    const all = [REV_A, REV_B];
    expect(buildRevisionChain(REV_A, all).map((d) => d.id)).toEqual(["rev-a", "rev-b"]);
    expect(buildRevisionChain(REV_B, all).map((d) => d.id)).toEqual(["rev-a", "rev-b"]);
  });

  it("handles a three-revision chain from any entry point", () => {
    const all = [REV_A, REV_B, REV_C];
    const ids = ["rev-a", "rev-b", "rev-c"];
    expect(buildRevisionChain(REV_A, all).map((d) => d.id)).toEqual(ids);
    expect(buildRevisionChain(REV_B, all).map((d) => d.id)).toEqual(ids);
    expect(buildRevisionChain(REV_C, all).map((d) => d.id)).toEqual(ids);
  });

  it("does not include unrelated documents", () => {
    const all = [REV_A, REV_B, UNRELATED];
    const chain = buildRevisionChain(REV_B, all);
    expect(chain.map((d) => d.id)).toEqual(["rev-a", "rev-b"]);
    expect(chain.find((d) => d.id === "unrelated")).toBeUndefined();
  });

  it("is safe against cycles (no infinite loop)", () => {
    // Fabricate a cycle: c3 → c2 → c1 → c3 (should not spin).
    const c1 = doc({ id: "c1", supersedesId: "c3" });
    const c2 = doc({ id: "c2", supersedesId: "c1" });
    const c3 = doc({ id: "c3", supersedesId: "c2" });
    const all = [c1, c2, c3];
    // Should terminate and return all three without hanging.
    const chain = buildRevisionChain(c1, all);
    expect(chain.length).toBe(3);
  });
});

describe("hasRevisionHistory", () => {
  it("is false for a lone doc (no siblings in lineage)", () => {
    expect(hasRevisionHistory(UNRELATED, [UNRELATED, REV_A])).toBe(false);
  });

  it("is true when at least one sibling is linked", () => {
    expect(hasRevisionHistory(REV_B, [REV_A, REV_B])).toBe(true);
  });
});
