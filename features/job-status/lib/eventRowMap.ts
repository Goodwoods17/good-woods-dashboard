import {
  JOB_ITEM_STATUSES,
  JOB_ITEM_EVENT_TYPES,
  ITEM_KINDS,
  VISIBILITIES,
  type JobItemEvent,
  type JobItemEventType,
  type ItemKind,
  type JobItemStatus,
  type Visibility,
} from "./types";

// The on-the-wire shape of a `public.job_item_events` row (snake_case).
export type JobItemEventRow = {
  id: string;
  job_id: string;
  item_kind: string;
  item_id: string;
  event_type: string;
  to_status: string | null;
  note: string | null;
  photo_path: string | null;
  visibility: string;
  worker_id: string | null;
  created_at: string;
};

// Unknown values coerce to safe defaults (Forms field-registry rule: a row
// written by a newer client must never crash an older reader).
function coerceEventType(v: string): JobItemEventType {
  return (JOB_ITEM_EVENT_TYPES as readonly string[]).includes(v) ? (v as JobItemEventType) : "note";
}
function coerceItemKind(v: string): ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(v) ? (v as ItemKind) : "job_item";
}
function coerceVisibility(v: string): Visibility {
  return (VISIBILITIES as readonly string[]).includes(v) ? (v as Visibility) : "owner";
}
function coerceStatus(v: string | null): JobItemStatus | null {
  if (!v) return null;
  return (JOB_ITEM_STATUSES as readonly string[]).includes(v) ? (v as JobItemStatus) : null;
}

export function rowToJobItemEvent(row: JobItemEventRow): JobItemEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    itemKind: coerceItemKind(row.item_kind),
    itemId: row.item_id,
    eventType: coerceEventType(row.event_type),
    toStatus: coerceStatus(row.to_status),
    note: row.note,
    photoPath: row.photo_path,
    visibility: coerceVisibility(row.visibility),
    workerId: row.worker_id,
    createdAt: row.created_at,
  };
}

// Insert shape: omit DB-defaulted columns.
export type JobItemEventInsertRow = Omit<JobItemEventRow, "id" | "created_at">;

export function jobItemEventToInsertRow(
  evt: Omit<JobItemEvent, "id" | "createdAt">
): JobItemEventInsertRow {
  return {
    job_id: evt.jobId,
    item_kind: evt.itemKind,
    item_id: evt.itemId,
    event_type: evt.eventType,
    to_status: evt.toStatus,
    note: evt.note,
    photo_path: evt.photoPath,
    visibility: evt.visibility,
    worker_id: evt.workerId,
  };
}
