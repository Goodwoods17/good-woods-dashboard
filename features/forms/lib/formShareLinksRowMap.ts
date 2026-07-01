import type { FormShareLink } from "@shared/lib/types";

export type FormShareLinkRow = {
  id: string;
  instance_id: string;
  token: string;
  recipient_name: string | null;
  recipient_type: string;
  locked_field_ids: unknown;
  sent_at: string | null;
  viewed_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  progress: number | null;
  revoked_at: string | null;
  submit_ip: string | null;
  submit_user_agent: string | null;
  created_at: string;
  created_by: string | null;
};

export function formShareLinkToRow(l: FormShareLink): FormShareLinkRow {
  return {
    id: l.id,
    instance_id: l.instanceId,
    token: l.token,
    recipient_name: l.recipientName ?? null,
    recipient_type: l.recipientType,
    locked_field_ids: l.lockedFieldIds,
    sent_at: l.sentAt ?? null,
    viewed_at: l.viewedAt ?? null,
    started_at: l.startedAt ?? null,
    submitted_at: l.submittedAt ?? null,
    progress: l.progress ?? null,
    revoked_at: l.revokedAt ?? null,
    submit_ip: l.submitIp ?? null,
    submit_user_agent: l.submitUserAgent ?? null,
    created_at: l.createdAt,
    created_by: l.createdBy ?? null,
  };
}
