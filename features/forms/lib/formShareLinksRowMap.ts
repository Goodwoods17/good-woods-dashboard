import type { FormShareLink, RecipientType } from "@shared/lib/types";

export type FormShareLinkRow = {
  id: string;
  instance_id: string;
  token: string;
  recipient_name: string | null;
  recipient_type: string;
  locked_field_ids: unknown;
  sent_at: string | null;
  viewed_at: string | null;
  submitted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
};

const RECIPIENT_TYPES: RecipientType[] = ["designer", "customer", "other"];

/** Coerce a DB recipient_type to the validated union (unknown → "other"). */
function toRecipientType(value: string): RecipientType {
  return RECIPIENT_TYPES.includes(value as RecipientType) ? (value as RecipientType) : "other";
}

/** Coerce the jsonb locked_field_ids to a string[] (tolerates null / bad shape). */
function toLockedFieldIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function rowToFormShareLink(row: FormShareLinkRow): FormShareLink {
  return {
    id: row.id,
    instanceId: row.instance_id,
    token: row.token,
    recipientName: row.recipient_name,
    recipientType: toRecipientType(row.recipient_type),
    lockedFieldIds: toLockedFieldIds(row.locked_field_ids),
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    submittedAt: row.submitted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

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
    submitted_at: l.submittedAt ?? null,
    revoked_at: l.revokedAt ?? null,
    created_at: l.createdAt,
    created_by: l.createdBy ?? null,
  };
}
