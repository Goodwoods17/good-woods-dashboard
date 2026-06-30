import { describe, it, expect } from "vitest";
import type { ProjectDocument } from "@shared/lib/types";
import { selectCurrentSpecDocuments, isCurrentSpecDocument } from "./currentSpec";

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
    ...over,
  };
}

describe("isCurrentSpecDocument", () => {
  it("admits a current document regardless of kind or source", () => {
    expect(isCurrentSpecDocument(doc({ isCurrent: true }))).toBe(true);
  });

  it("admits a current Drive-link (internal tools still see the whole set)", () => {
    expect(isCurrentSpecDocument(doc({ isCurrent: true, source: "link" }))).toBe(true);
  });

  it("admits a current toolpath_cnc (no kind restriction — staff can pin any kind)", () => {
    expect(isCurrentSpecDocument(doc({ isCurrent: true, kind: "toolpath_cnc" }))).toBe(true);
  });

  it("excludes a non-current document", () => {
    expect(isCurrentSpecDocument(doc({ isCurrent: false }))).toBe(false);
  });
});

describe("selectCurrentSpecDocuments", () => {
  it("returns every doc where isCurrent=true", () => {
    const docs = [
      doc({ id: "a", isCurrent: true, kind: "designer" }),
      doc({ id: "b", isCurrent: false, kind: "shop" }),
      doc({ id: "c", isCurrent: true, kind: "toolpath_cnc" }),
      doc({ id: "d", isCurrent: true, source: "link" }),
    ];
    expect(selectCurrentSpecDocuments(docs).map((d) => d.id)).toEqual(["a", "c", "d"]);
  });

  it("returns an empty array when no documents are current", () => {
    const docs = [doc({ isCurrent: false }), doc({ id: "d2", isCurrent: false })];
    expect(selectCurrentSpecDocuments(docs)).toHaveLength(0);
  });

  it("returns an empty array for an empty input", () => {
    expect(selectCurrentSpecDocuments([])).toHaveLength(0);
  });

  it("preserves the original order", () => {
    const docs = [
      doc({ id: "z", isCurrent: true }),
      doc({ id: "a", isCurrent: true }),
    ];
    expect(selectCurrentSpecDocuments(docs).map((d) => d.id)).toEqual(["z", "a"]);
  });
});
