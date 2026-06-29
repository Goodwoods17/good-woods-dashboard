import { describe, expect, it } from "vitest";
import { isPortalFileAuthorized } from "./documentWatermarkServer";
import type { ProjectDocument } from "@shared/lib/types";

// S4 (issue #215) — the watermark file route re-authorises the requested document
// against the token's job + the SAME client-safe exposure rules as the view
// portal, so a recipient can't pull an internal drawing by guessing its id.

function doc(over: Partial<ProjectDocument>): ProjectDocument {
  return {
    id: "d1",
    projectId: "job-1",
    kind: "designer",
    label: "Kitchen elevations",
    driveUrl: null,
    version: "R2",
    isCurrent: true,
    notes: null,
    uploadedBy: null,
    createdAt: "2026-06-01T00:00:00Z",
    source: "upload",
    storagePath: "job-1/d1.pdf",
    mime: "application/pdf",
    pageCount: 4,
    ...over,
  };
}

describe("isPortalFileAuthorized", () => {
  const anchor = doc({ id: "anchor", storagePath: "job-1/anchor.pdf" });

  it("allows a current, uploaded, client-safe doc in the anchor's job", () => {
    expect(isPortalFileAuthorized(anchor, doc({ id: "d1" }))).toBe(true);
  });

  it("denies a doc from a DIFFERENT job (id-guessing across projects)", () => {
    expect(isPortalFileAuthorized(anchor, doc({ id: "d1", projectId: "job-2" }))).toBe(false);
  });

  it("denies an internal kind even within the same job", () => {
    expect(isPortalFileAuthorized(anchor, doc({ kind: "toolpath_cnc" }))).toBe(false);
  });

  it("denies a Drive-link doc (no-login access can't be guaranteed)", () => {
    expect(
      isPortalFileAuthorized(anchor, doc({ source: "link", storagePath: null, driveUrl: "x" }))
    ).toBe(false);
  });

  it("denies a superseded (non-current) revision", () => {
    expect(isPortalFileAuthorized(anchor, doc({ isCurrent: false }))).toBe(false);
  });

  it("denies when the anchor or requested doc is missing", () => {
    expect(isPortalFileAuthorized(null, doc({}))).toBe(false);
    expect(isPortalFileAuthorized(anchor, null)).toBe(false);
  });
});
