import {
  CAPABILITY_TYPES,
  type CapabilityType,
  type ShareToken,
  type ShareTokenState,
} from "./types";

/**
 * Row ↔ domain mapping for the generalized `share_tokens` capability registry
 * (ADR 0022). Snake-case DB columns ↔ the camelCase `ShareToken`. The `state`
 * jsonb carries the type-specific bits the legacy per-feature columns used to
 * hold; it is coerced to a safe object (never null) so readers can destructure
 * without guarding, and `locked_field_ids` defaults to the server-side security
 * gate's empty list rather than undefined.
 */
export type ShareTokenRow = {
  id: string;
  capability_type: string;
  form_instance_id: string | null;
  job_id: string | null;
  document_id: string | null;
  token: string;
  recipient_name: string | null;
  viewed_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  view_count: number | null;
  ip: string | null;
  ua: string | null;
  created_at: string;
  created_by: string | null;
  state: unknown;
};

/** Coerce a DB capability_type to the validated union (unknown → "document_view"). */
export function toCapabilityType(value: string): CapabilityType {
  return CAPABILITY_TYPES.includes(value as CapabilityType)
    ? (value as CapabilityType)
    : "document_view";
}

/** Coerce the `state` jsonb to a safe object (tolerates null / bad shape). */
function toState(value: unknown): ShareTokenState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ShareTokenState;
}

export function rowToShareToken(row: ShareTokenRow): ShareToken {
  return {
    id: row.id,
    capabilityType: toCapabilityType(row.capability_type),
    formInstanceId: row.form_instance_id,
    jobId: row.job_id,
    documentId: row.document_id,
    token: row.token,
    recipientName: row.recipient_name,
    viewedAt: row.viewed_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    viewCount: typeof row.view_count === "number" ? row.view_count : 0,
    ip: row.ip,
    ua: row.ua,
    createdAt: row.created_at,
    createdBy: row.created_by,
    state: toState(row.state),
  };
}

export function shareTokenToRow(t: ShareToken): ShareTokenRow {
  return {
    id: t.id,
    capability_type: t.capabilityType,
    form_instance_id: t.formInstanceId,
    job_id: t.jobId,
    document_id: t.documentId,
    token: t.token,
    recipient_name: t.recipientName ?? null,
    viewed_at: t.viewedAt ?? null,
    revoked_at: t.revokedAt ?? null,
    expires_at: t.expiresAt ?? null,
    view_count: t.viewCount,
    ip: t.ip ?? null,
    ua: t.ua ?? null,
    created_at: t.createdAt,
    created_by: t.createdBy ?? null,
    state: t.state ?? {},
  };
}
