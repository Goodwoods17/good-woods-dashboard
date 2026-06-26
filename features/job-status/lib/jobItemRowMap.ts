import {
  JOB_ITEM_STATUSES,
  JOB_ITEM_SOURCES,
  VISIBILITIES,
  type JobItem,
  type JobItemSource,
  type JobItemStatus,
  type Phase,
  type Visibility,
} from "./types";
import { MILESTONE_STAGES } from "@shared/lib/types";

// The on-the-wire shape of a `public.job_items` row (snake_case).
export type JobItemRow = {
  id: string;
  job_id: string;
  phase: string;
  label: string;
  source: string;
  template_id: string | null;
  status: string;
  visibility: string;
  sort_order: number;
  status_updated_at: string | null;
  status_updated_by: string | null;
  created_at: string;
};

const PHASES: readonly Phase[] = MILESTONE_STAGES.map((s) => s.key);

// Unknown enum values coerce to a safe default rather than throwing — the Forms
// field-registry rule: a row written by a newer client must never crash an older
// reader; it degrades to a known-safe value instead.
function coerceStatus(value: string): JobItemStatus {
  return (JOB_ITEM_STATUSES as readonly string[]).includes(value)
    ? (value as JobItemStatus)
    : "not_started";
}
function coerceVisibility(value: string): Visibility {
  return (VISIBILITIES as readonly string[]).includes(value) ? (value as Visibility) : "owner";
}
function coerceSource(value: string): JobItemSource {
  return (JOB_ITEM_SOURCES as readonly string[]).includes(value)
    ? (value as JobItemSource)
    : "adhoc";
}
function coercePhase(value: string): Phase {
  return (PHASES as readonly string[]).includes(value) ? (value as Phase) : "design";
}

export function rowToJobItem(row: JobItemRow): JobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    phase: coercePhase(row.phase),
    label: row.label,
    source: coerceSource(row.source),
    templateId: row.template_id,
    status: coerceStatus(row.status),
    visibility: coerceVisibility(row.visibility),
    sortOrder: row.sort_order,
    statusUpdatedAt: row.status_updated_at,
    statusUpdatedBy: row.status_updated_by,
    createdAt: row.created_at,
  };
}

// Insert shape: omit DB-defaulted columns (id, created_at) so Postgres fills them.
export type JobItemInsertRow = Omit<JobItemRow, "id" | "created_at">;

export function jobItemToInsertRow(item: JobItem): JobItemInsertRow {
  return {
    job_id: item.jobId,
    phase: item.phase,
    label: item.label,
    source: item.source,
    template_id: item.templateId,
    status: item.status,
    visibility: item.visibility,
    sort_order: item.sortOrder,
    status_updated_at: item.statusUpdatedAt,
    status_updated_by: item.statusUpdatedBy,
  };
}
