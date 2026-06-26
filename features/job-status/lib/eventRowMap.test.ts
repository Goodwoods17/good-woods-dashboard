import { describe, it, expect } from "vitest";
import { rowToJobItemEvent, type JobItemEventRow } from "./eventRowMap";
import type { JobItemEvent } from "./types";

const row: JobItemEventRow = {
  id: "evt-1",
  job_id: "job-status-demo",
  item_kind: "job_item",
  item_id: "item-123",
  event_type: "note",
  to_status: null,
  note: "Glue-up looks great",
  photo_path: null,
  visibility: "owner",
  worker_id: "crew-1",
  created_at: "2026-06-28T10:00:00Z",
};

describe("rowToJobItemEvent", () => {
  it("maps snake_case columns to the camelCase domain model", () => {
    const evt = rowToJobItemEvent(row);
    expect(evt).toEqual<JobItemEvent>({
      id: "evt-1",
      jobId: "job-status-demo",
      itemKind: "job_item",
      itemId: "item-123",
      eventType: "note",
      toStatus: null,
      note: "Glue-up looks great",
      photoPath: null,
      visibility: "owner",
      workerId: "crew-1",
      createdAt: "2026-06-28T10:00:00Z",
    });
  });

  it("maps a photo event with a photo_path", () => {
    const evt = rowToJobItemEvent({
      ...row,
      event_type: "photo",
      photo_path: "job-status-demo/item-123/1719568800000.jpg",
    });
    expect(evt.eventType).toBe("photo");
    expect(evt.photoPath).toBe("job-status-demo/item-123/1719568800000.jpg");
  });

  it("maps a status_change event with to_status", () => {
    const evt = rowToJobItemEvent({
      ...row,
      event_type: "status_change",
      to_status: "in_progress",
    });
    expect(evt.eventType).toBe("status_change");
    expect(evt.toStatus).toBe("in_progress");
  });

  it("coerces unknown event_type to 'note' safe fallback (never throws)", () => {
    const evt = rowToJobItemEvent({ ...row, event_type: "teleported" });
    expect(evt.eventType).toBe("note");
  });

  it("coerces unknown item_kind to 'job_item' safe fallback", () => {
    const evt = rowToJobItemEvent({ ...row, item_kind: "furniture" });
    expect(evt.itemKind).toBe("job_item");
  });

  it("coerces unknown visibility to 'owner' safe fallback", () => {
    const evt = rowToJobItemEvent({ ...row, visibility: "everyone" });
    expect(evt.visibility).toBe("owner");
  });

  it("coerces unknown to_status to null safe fallback", () => {
    const evt = rowToJobItemEvent({ ...row, event_type: "status_change", to_status: "flying" });
    expect(evt.toStatus).toBeNull();
  });

  it("handles null worker_id", () => {
    const evt = rowToJobItemEvent({ ...row, worker_id: null });
    expect(evt.workerId).toBeNull();
  });
});
