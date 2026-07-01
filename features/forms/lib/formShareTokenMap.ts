import { toState, type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import type { FormShareLink, RecipientType, ShareTokenState } from "@shared/lib/types";

/**
 * S5b (milestone #12, ADR 0022) — the retrofit seam that rides the LIVE Forms
 * `/f/<token>` portal on the generalized `share_tokens` registry instead of the
 * legacy per-feature `form_share_links` table. Forms is the riskiest retrofit
 * (live, unflagged, write-heavy), so the column contract moves carefully:
 *
 *   * the anchor is `form_instance_id` (capability_type=form);
 *   * the shared typed columns map straight across — `viewed_at`, `revoked_at`,
 *     `recipient_name`, `created_at`, `created_by` — and the audit pair
 *     `submit_ip`/`submit_user_agent` lands on the shared `ip`/`ua` columns;
 *   * the form-specific bits the legacy table carried as dedicated columns move
 *     into the `state` jsonb under camelCase keys: `recipientType`,
 *     `lockedFieldIds` (the server-side security gate — never null, defaults
 *     []), and the owner-only status stamps `sentAt` / `startedAt` /
 *     `submittedAt` / `progress`.
 *
 * The `id` is preserved verbatim so the dual-written rows stay aligned
 * row-for-row with the legacy table during the overlap (revoke-by-id then hits
 * the same logical link in both). Forms links never expire, so `expires_at` is
 * always null. The mapping is pure (no I/O) so it unit-tests in isolation.
 */

const RECIPIENT_TYPES: RecipientType[] = ["designer", "customer", "other"];

/** Coerce a state recipientType back to the validated union (unknown → "other"). */
function toRecipientType(value: unknown): RecipientType {
  return RECIPIENT_TYPES.includes(value as RecipientType) ? (value as RecipientType) : "other";
}

/** Coerce a state lockedFieldIds to a string[] (tolerates null / bad shape). */
function toLockedFieldIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Build the `state` jsonb for a form share token. `lockedFieldIds` +
 * `recipientType` are always present; the nullable stamps are OMITTED when null
 * (never written as a JSON null) so the `share_tokens.state -> 'progress'` jsonb
 * guard, which requires a number when the key exists, is never tripped.
 */
export function formShareLinkToShareTokenState(link: FormShareLink): ShareTokenState {
  const state: ShareTokenState = {
    lockedFieldIds: link.lockedFieldIds,
    recipientType: link.recipientType,
  };
  if (link.sentAt !== null) state.sentAt = link.sentAt;
  if (link.startedAt !== null) state.startedAt = link.startedAt;
  if (link.submittedAt !== null) state.submittedAt = link.submittedAt;
  if (link.progress !== null) state.progress = link.progress;
  return state;
}

/** FormShareLink → a `share_tokens` row (capability_type=form, form_instance anchor). */
export function formShareLinkToShareTokenRow(link: FormShareLink): ShareTokenRow {
  return {
    id: link.id,
    capability_type: "form",
    form_instance_id: link.instanceId,
    job_id: null,
    document_id: null,
    token: link.token,
    recipient_name: link.recipientName ?? null,
    viewed_at: link.viewedAt ?? null,
    revoked_at: link.revokedAt ?? null,
    expires_at: null, // form links never expire (no opt-in expiry)
    view_count: 0,
    ip: link.submitIp ?? null,
    ua: link.submitUserAgent ?? null,
    created_at: link.createdAt,
    created_by: link.createdBy ?? null,
    state: formShareLinkToShareTokenState(link),
  };
}

/** A form `share_tokens` row → FormShareLink (form-specific bits read back from state). */
export function shareTokenRowToFormShareLink(row: ShareTokenRow): FormShareLink {
  const state = toState(row.state);
  return {
    id: row.id,
    instanceId: row.form_instance_id ?? "",
    token: row.token,
    recipientName: row.recipient_name,
    recipientType: toRecipientType(state.recipientType),
    lockedFieldIds: toLockedFieldIds(state.lockedFieldIds),
    sentAt: typeof state.sentAt === "string" ? state.sentAt : null,
    viewedAt: row.viewed_at,
    startedAt: typeof state.startedAt === "string" ? state.startedAt : null,
    submittedAt: typeof state.submittedAt === "string" ? state.submittedAt : null,
    progress: typeof state.progress === "number" ? state.progress : null,
    revokedAt: row.revoked_at,
    submitIp: row.ip,
    submitUserAgent: row.ua,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}
