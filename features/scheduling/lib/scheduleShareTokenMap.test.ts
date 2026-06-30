import { describe, it, expect } from "vitest";
import {
  scheduleShareLinkToShareTokenRow,
  shareTokenRowToScheduleShareLink,
} from "./scheduleShareTokenMap";
import type { ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import type { ScheduleShareLink } from "@shared/lib/types";

function baseLink(over: Partial<ScheduleShareLink> = {}): ScheduleShareLink {
  return {
    id: "51180000-0000-4000-8000-000000000001",
    jobId: "job-status-demo",
    token: "e2eschedontrack00000000000000000000ab",
    recipientName: "E2E Test Client",
    committedDateSnapshot: "2026-12-15",
    viewedAt: null,
    revokedAt: null,
    createdAt: "2026-06-29T00:00:00Z",
    createdBy: "owner@goodwoods",
    ...over,
  };
}

describe("scheduleShareLinkToShareTokenRow", () => {
  it("anchors on job_id with capability_type=schedule and no other anchor", () => {
    const row = scheduleShareLinkToShareTokenRow(baseLink());
    expect(row.capability_type).toBe("schedule");
    expect(row.job_id).toBe("job-status-demo");
    expect(row.form_instance_id).toBeNull();
    expect(row.document_id).toBeNull();
  });

  it("moves committed_date_snapshot into state (the type-specific bit)", () => {
    const row = scheduleShareLinkToShareTokenRow(baseLink());
    expect(row.state).toEqual({ committedDateSnapshot: "2026-12-15" });
  });

  it("preserves the id (parity with the legacy row) and shared columns verbatim", () => {
    const row = scheduleShareLinkToShareTokenRow(
      baseLink({ viewedAt: "2026-06-29T12:00:00Z", revokedAt: "2026-06-30T00:00:00Z" })
    );
    expect(row.id).toBe("51180000-0000-4000-8000-000000000001");
    expect(row.token).toBe("e2eschedontrack00000000000000000000ab");
    expect(row.recipient_name).toBe("E2E Test Client");
    expect(row.viewed_at).toBe("2026-06-29T12:00:00Z");
    expect(row.revoked_at).toBe("2026-06-30T00:00:00Z");
    expect(row.created_at).toBe("2026-06-29T00:00:00Z");
    expect(row.created_by).toBe("owner@goodwoods");
  });

  it("schedule links never expire — expires_at is null and view_count starts at 0", () => {
    const row = scheduleShareLinkToShareTokenRow(baseLink());
    expect(row.expires_at).toBeNull();
    expect(row.view_count).toBe(0);
  });
});

describe("shareTokenRowToScheduleShareLink", () => {
  function tokenRow(over: Partial<ShareTokenRow> = {}): ShareTokenRow {
    return {
      id: "51180000-0000-4000-8000-000000000001",
      capability_type: "schedule",
      form_instance_id: null,
      job_id: "job-status-demo",
      document_id: null,
      token: "e2eschedontrack00000000000000000000ab",
      recipient_name: "E2E Test Client",
      viewed_at: null,
      revoked_at: null,
      expires_at: null,
      view_count: 0,
      ip: null,
      ua: null,
      created_at: "2026-06-29T00:00:00Z",
      created_by: "owner@goodwoods",
      state: { committedDateSnapshot: "2026-12-15" },
      ...over,
    };
  }

  it("reads committedDateSnapshot back out of state", () => {
    const link = shareTokenRowToScheduleShareLink(tokenRow());
    expect(link.committedDateSnapshot).toBe("2026-12-15");
    expect(link.jobId).toBe("job-status-demo");
    expect(link.recipientName).toBe("E2E Test Client");
  });

  it("falls back to an empty snapshot when state is missing the key (defensive)", () => {
    const link = shareTokenRowToScheduleShareLink(tokenRow({ state: {} }));
    expect(link.committedDateSnapshot).toBe("");
  });

  it("round-trips a link through both mappers unchanged", () => {
    const original = baseLink({ viewedAt: "2026-06-29T12:00:00Z" });
    const row = scheduleShareLinkToShareTokenRow(original);
    const back = shareTokenRowToScheduleShareLink(row);
    expect(back).toEqual(original);
  });
});
