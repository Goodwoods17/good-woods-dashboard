import type { ScheduleShareLink } from "@shared/lib/types";

export type ScheduleShareLinkRow = {
  id: string;
  job_id: string;
  token: string;
  recipient_name: string | null;
  committed_date_snapshot: string;
  viewed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
};

export function scheduleShareLinkToRow(l: ScheduleShareLink): ScheduleShareLinkRow {
  return {
    id: l.id,
    job_id: l.jobId,
    token: l.token,
    recipient_name: l.recipientName ?? null,
    committed_date_snapshot: l.committedDateSnapshot,
    viewed_at: l.viewedAt ?? null,
    revoked_at: l.revokedAt ?? null,
    created_at: l.createdAt,
    created_by: l.createdBy ?? null,
  };
}
