/**
 * S17 — Row mapper for public.priority_bumps.
 * The bump audit record is write-only from the UI (one INSERT per confirmed
 * bump); `bumped_at` is defaulted by the DB and so is not part of the row map.
 */
import type { PriorityBumpRecord } from "./priorityBump";

export type PriorityBumpRow = {
  id: string;
  priority_job_id: string;
  bumped_job_id: string;
  bump_days: number;
  reason: string;
  old_committed_date: string | null;
  new_committed_date: string;
  bumped_by: string | null;
};

export function priorityBumpRecordToRow(rec: PriorityBumpRecord): PriorityBumpRow {
  return {
    id: rec.id,
    priority_job_id: rec.priorityJobId,
    bumped_job_id: rec.bumpedJobId,
    bump_days: rec.bumpDays,
    reason: rec.reason,
    old_committed_date: rec.oldCommittedDate,
    new_committed_date: rec.newCommittedDate,
    bumped_by: rec.bumpedBy,
  };
}

export function rowToPriorityBumpRecord(
  row: PriorityBumpRow
): Omit<PriorityBumpRecord, "bumpedAt"> {
  return {
    id: row.id,
    priorityJobId: row.priority_job_id,
    bumpedJobId: row.bumped_job_id,
    bumpDays: row.bump_days,
    reason: row.reason,
    oldCommittedDate: row.old_committed_date,
    newCommittedDate: row.new_committed_date,
    bumpedBy: row.bumped_by,
  };
}
