import type { ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import type { ScheduleShareLink } from "@shared/lib/types";

/**
 * S5a (milestone #12, ADR 0022) — the retrofit seam that lets the Scheduling
 * client portal ride the generalized `share_tokens` registry instead of the
 * legacy per-feature `schedule_share_links` table.
 *
 * A schedule share is a `capability_type = "schedule"` row anchored on its
 * `job_id`; the one type-specific bit the legacy table carried as a dedicated
 * `committed_date_snapshot` column moves into the `state` jsonb (keyed
 * `committedDateSnapshot`, the same well-known key `ShareTokenState` already
 * types). The `id` is preserved verbatim so the dual-written rows stay aligned
 * row-for-row with the legacy table during the overlap (revoke-by-id then hits
 * the same logical link in both). Schedule links never expire, so `expires_at`
 * is always null. The mapping is pure (no I/O) so it unit-tests in isolation.
 */

/** ScheduleShareLink → a `share_tokens` row (capability_type=schedule, job anchor). */
export function scheduleShareLinkToShareTokenRow(link: ScheduleShareLink): ShareTokenRow {
  return {
    id: link.id,
    capability_type: "schedule",
    form_instance_id: null,
    job_id: link.jobId,
    document_id: null,
    token: link.token,
    recipient_name: link.recipientName ?? null,
    viewed_at: link.viewedAt ?? null,
    revoked_at: link.revokedAt ?? null,
    expires_at: null, // schedule links never expire (no opt-in expiry)
    view_count: 0,
    ip: null,
    ua: null,
    created_at: link.createdAt,
    created_by: link.createdBy ?? null,
    state: { committedDateSnapshot: link.committedDateSnapshot },
  };
}

/** A schedule `share_tokens` row → ScheduleShareLink (snapshot read back out of state). */
export function shareTokenRowToScheduleShareLink(row: ShareTokenRow): ScheduleShareLink {
  const state = (row.state && typeof row.state === "object" ? row.state : {}) as {
    committedDateSnapshot?: string;
  };
  return {
    id: row.id,
    jobId: row.job_id ?? "",
    token: row.token,
    recipientName: row.recipient_name,
    committedDateSnapshot: state.committedDateSnapshot ?? "",
    viewedAt: row.viewed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}
