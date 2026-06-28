/**
 * S14 — Row mapper for public.commitment_revisions.
 * Converts between Postgres snake_case rows and the CommitmentRevision domain
 * type. One immutable row per deliberate committed-date change.
 */
import type { CommitmentRevision, RecommitReasonCode, RevisionKind } from "./recommit";

export type CommitmentRevisionRow = {
  id: string;
  job_id: string;
  kind: RevisionKind;
  reason_code: RecommitReasonCode;
  old_committed_date: string | null;
  new_committed_date: string;
  old_buffer_days: number | null;
  new_buffer_days: number | null;
  dings_reliability: boolean;
  note: string | null;
  revised_by: string | null;
  revised_at: string;
};

export function rowToCommitmentRevision(row: CommitmentRevisionRow): CommitmentRevision {
  return {
    id: row.id,
    jobId: row.job_id,
    kind: row.kind,
    reasonCode: row.reason_code,
    oldCommittedDate: row.old_committed_date,
    newCommittedDate: row.new_committed_date,
    oldBufferDays: row.old_buffer_days,
    newBufferDays: row.new_buffer_days,
    dingsReliability: row.dings_reliability,
    note: row.note,
    revisedBy: row.revised_by,
    revisedAt: row.revised_at,
  };
}

export function commitmentRevisionToRow(rev: CommitmentRevision): CommitmentRevisionRow {
  return {
    id: rev.id,
    job_id: rev.jobId,
    kind: rev.kind,
    reason_code: rev.reasonCode,
    old_committed_date: rev.oldCommittedDate,
    new_committed_date: rev.newCommittedDate,
    old_buffer_days: rev.oldBufferDays,
    new_buffer_days: rev.newBufferDays,
    dings_reliability: rev.dingsReliability,
    note: rev.note,
    revised_by: rev.revisedBy,
    revised_at: rev.revisedAt,
  };
}
