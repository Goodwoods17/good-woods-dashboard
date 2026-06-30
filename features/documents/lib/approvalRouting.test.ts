import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUS_META,
  REVIEWER_ROLES,
  allApproved,
  computeRoutingStatus,
  makePendingApprovals,
  type DocumentApproval,
} from "./approvalRouting";

const DOC = "52d00000-0000-4000-8000-000000000001";

function approval(
  role: DocumentApproval["reviewerRole"],
  status: DocumentApproval["status"]
): DocumentApproval {
  return {
    id: `${role}-id`,
    documentId: DOC,
    reviewerRole: role,
    status,
    reviewerName: null,
    notes: null,
    reviewedAt: status === "pending" ? null : "2026-06-30T00:00:00Z",
    createdAt: "2026-06-29T00:00:00Z",
  };
}

describe("makePendingApprovals", () => {
  it("seeds one pending row per required reviewer role", () => {
    const rows = makePendingApprovals(DOC, REVIEWER_ROLES);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.reviewerRole).sort()).toEqual(["architect", "gc", "pm"]);
    for (const r of rows) {
      expect(r.status).toBe("pending");
      expect(r.reviewedAt).toBeNull();
      expect(r.documentId).toBe(DOC);
    }
  });
});

describe("allApproved — the parallel gate", () => {
  it("is false while any required reviewer is still pending", () => {
    const rows = [
      approval("architect", "approved"),
      approval("gc", "approved"),
      approval("pm", "pending"),
    ];
    expect(allApproved(rows)).toBe(false);
  });

  it("is false if a reviewer asked for revisions, even if the others approved", () => {
    const rows = [
      approval("architect", "approved"),
      approval("gc", "needs_revision"),
      approval("pm", "approved"),
    ];
    expect(allApproved(rows)).toBe(false);
  });

  it("becomes true ONLY once every required reviewer has approved", () => {
    const rows = [
      approval("architect", "approved"),
      approval("gc", "approved"),
      approval("pm", "approved"),
    ];
    expect(allApproved(rows)).toBe(true);
  });

  it("is false when a required role has no row at all (missing sign-off)", () => {
    const rows = [approval("architect", "approved"), approval("gc", "approved")];
    expect(allApproved(rows)).toBe(false);
  });
});

describe("computeRoutingStatus — the doc-level 3-status outcome", () => {
  it("is pending when reviews are outstanding and none rejected", () => {
    const rows = [approval("architect", "approved"), approval("gc", "pending")];
    expect(computeRoutingStatus(rows)).toBe("pending");
  });

  it("is needs_revision the moment any reviewer rejects (rejection wins over pending)", () => {
    const rows = [
      approval("architect", "needs_revision"),
      approval("gc", "pending"),
      approval("pm", "pending"),
    ];
    expect(computeRoutingStatus(rows)).toBe("needs_revision");
  });

  it("is approved only after all required reviewers approve", () => {
    const rows = [
      approval("architect", "approved"),
      approval("gc", "approved"),
      approval("pm", "approved"),
    ];
    expect(computeRoutingStatus(rows)).toBe("approved");
  });

  it("treats an empty routing (no rows) as pending, never approved", () => {
    expect(computeRoutingStatus([])).toBe("pending");
  });
});

describe("APPROVAL_STATUS_META — the 3-status colour system", () => {
  it("labels the three statuses for the UI", () => {
    expect(APPROVAL_STATUS_META.pending.label).toBe("Pending Review");
    expect(APPROVAL_STATUS_META.approved.label).toBe("Approved");
    expect(APPROVAL_STATUS_META.needs_revision.label).toBe("Needs Revision");
  });

  it("gives each status a distinct pill class so they never read alike", () => {
    const classes = new Set([
      APPROVAL_STATUS_META.pending.pillClass,
      APPROVAL_STATUS_META.approved.pillClass,
      APPROVAL_STATUS_META.needs_revision.pillClass,
    ]);
    expect(classes.size).toBe(3);
  });
});
