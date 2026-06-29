import { describe, it, expect } from "vitest";
import type { ProjectDocument } from "@shared/lib/types";
import {
  isClientSafeDocument,
  selectClientSafeDocuments,
  countExcludedDriveLinks,
  computeSuperseded,
} from "./documentShare";

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

describe("isClientSafeDocument — the server-mirrored exposure rules", () => {
  it("admits a current, uploaded, client-safe-kind document", () => {
    expect(isClientSafeDocument(doc({}))).toBe(true);
  });

  it("excludes the internal toolpath_cnc kind", () => {
    expect(isClientSafeDocument(doc({ kind: "toolpath_cnc" }))).toBe(false);
  });

  it("excludes the un-triaged 'other' kind", () => {
    expect(isClientSafeDocument(doc({ kind: "other" }))).toBe(false);
  });

  it("excludes a Drive-link (source:'link') doc — no-login access can't be guaranteed", () => {
    expect(
      isClientSafeDocument(
        doc({
          source: "link",
          driveUrl: "https://drive.google.com/file/d/x/view",
          storagePath: null,
        })
      )
    ).toBe(false);
  });

  it("excludes a superseded (non-current) revision", () => {
    expect(isClientSafeDocument(doc({ isCurrent: false }))).toBe(false);
  });
});

describe("selectClientSafeDocuments", () => {
  it("keeps only the docs that pass every exposure rule", () => {
    const docs = [
      doc({ id: "ok", kind: "designer" }),
      doc({ id: "cnc", kind: "toolpath_cnc" }),
      doc({ id: "other", kind: "other" }),
      doc({ id: "drive", source: "link", storagePath: null }),
      doc({ id: "old", isCurrent: false }),
      doc({ id: "permit", kind: "permit" }),
    ];
    expect(selectClientSafeDocuments(docs).map((d) => d.id)).toEqual(["ok", "permit"]);
  });
});

describe("countExcludedDriveLinks — the mint-time warning", () => {
  it("counts current client-safe-kind docs excluded ONLY because they're Drive links", () => {
    const docs = [
      doc({ id: "drive1", source: "link", storagePath: null }),
      doc({ id: "drive2", kind: "permit", source: "link", storagePath: null }),
      doc({ id: "upload", source: "upload" }),
      // a drive link of an internal kind is excluded for kind too — not the warning's concern
      doc({ id: "driveCnc", kind: "toolpath_cnc", source: "link", storagePath: null }),
      // a non-current drive link wouldn't have been shared anyway
      doc({ id: "driveOld", source: "link", storagePath: null, isCurrent: false }),
    ];
    expect(countExcludedDriveLinks(docs)).toBe(2);
  });
});

describe("computeSuperseded — the portal banner", () => {
  it("reports not-superseded for a current anchor", () => {
    expect(computeSuperseded(doc({ isCurrent: true }), [])).toEqual({
      superseded: false,
      currentVersion: null,
    });
  });

  it("reports superseded + the current revision's version for a stale anchor", () => {
    const anchor = doc({ id: "old", kind: "designer", version: "R1", isCurrent: false });
    const siblings = [
      doc({ id: "new", kind: "designer", version: "R3", isCurrent: true }),
      doc({ id: "unrelated", kind: "permit", version: "R9", isCurrent: true }),
    ];
    expect(computeSuperseded(anchor, siblings)).toEqual({ superseded: true, currentVersion: "R3" });
  });
});
