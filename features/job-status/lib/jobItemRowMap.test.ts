import { describe, it, expect } from "vitest";
import { rowToJobItem, jobItemToInsertRow, type JobItemRow } from "./jobItemRowMap";
import type { JobItem } from "./types";

const row: JobItemRow = {
  id: "ji-1",
  job_id: "job-status-demo",
  phase: "assembly",
  label: "Glue up carcass",
  source: "adhoc",
  template_id: null,
  status: "in_progress",
  visibility: "owner",
  sort_order: 3,
  status_updated_at: "2026-06-28T01:00:00Z",
  status_updated_by: "crew-1",
  created_at: "2026-06-28T00:00:00Z",
};

describe("rowToJobItem", () => {
  it("maps snake_case columns to the camelCase domain model", () => {
    const item = rowToJobItem(row);
    expect(item).toEqual<JobItem>({
      id: "ji-1",
      jobId: "job-status-demo",
      phase: "assembly",
      label: "Glue up carcass",
      source: "adhoc",
      templateId: null,
      status: "in_progress",
      visibility: "owner",
      sortOrder: 3,
      statusUpdatedAt: "2026-06-28T01:00:00Z",
      statusUpdatedBy: "crew-1",
      createdAt: "2026-06-28T00:00:00Z",
    });
  });

  it("coerces unknown status/visibility/source/phase to safe defaults (never throws)", () => {
    const item = rowToJobItem({
      ...row,
      status: "teleported",
      visibility: "public",
      source: "wizardry",
      phase: "moon-landing",
    });
    expect(item.status).toBe("not_started");
    expect(item.visibility).toBe("owner");
    expect(item.source).toBe("adhoc");
    expect(item.phase).toBe("design");
  });
});

describe("jobItemToInsertRow", () => {
  it("produces a snake_case insert row without DB-defaulted columns", () => {
    const item = rowToJobItem(row);
    const insert = jobItemToInsertRow(item);
    expect(insert).toEqual({
      job_id: "job-status-demo",
      phase: "assembly",
      label: "Glue up carcass",
      source: "adhoc",
      template_id: null,
      status: "in_progress",
      visibility: "owner",
      sort_order: 3,
      status_updated_at: "2026-06-28T01:00:00Z",
      status_updated_by: "crew-1",
    });
    expect(insert).not.toHaveProperty("id");
    expect(insert).not.toHaveProperty("created_at");
  });
});
