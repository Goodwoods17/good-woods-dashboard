-- Project Files & Sharing (Tier-2) · S5a (issue #216, milestone #12, ADR 0022) —
-- RETROFIT the Scheduling client portal onto the generalized `share_tokens`
-- registry. Scheduling is DARK in prod (NEXT_PUBLIC_SCHEDULING_ENABLED off), so
-- it migrates FIRST as a zero-live-traffic rehearsal for the S5b Forms retrofit.
--
-- This migration BACKFILLS every existing `schedule_share_links` row into
-- `share_tokens` as a `capability_type = 'schedule'` row:
--   * job_id            → the typed job anchor (jobs.id is TEXT; the column matches)
--   * committed_date_snapshot → state.committedDateSnapshot (the one type-specific
--                          bit the legacy table carried as a dedicated column;
--                          camelCase to match ShareTokenState in TS, ISO date string)
--   * token / recipient_name / viewed_at / revoked_at / created_at / created_by
--                          → copied VERBATIM (viewed_at read-receipts preserved)
--   * id                → copied VERBATIM so the dual-written rows stay aligned
--                          row-for-row with the legacy table (revoke-by-id hits both)
--   * expires_at        → NULL (schedule links never expire), view_count → 0
--
-- IDEMPOTENT: the insert is guarded by `where not exists (… token …)` against the
-- GLOBAL-unique `share_tokens.token`, so re-running it is a no-op and there can be
-- ZERO token collisions (a token already present — from a prior run or a future
-- dual-write — is skipped, never duplicated).
--
-- The legacy `schedule_share_links` table is LEFT IN PLACE and still dual-written
-- by the owner store during the overlap; only the READ path is cut to
-- `share_tokens`. The table is dropped in a later cleanup, after S5b proves the
-- mechanics on the live Forms portal — never in this rehearsal slice.
--
-- ADDITIVE + idempotent; ships behind NEXT_PUBLIC_PROJECT_FILES_ENABLED (off in
-- prod). Applied to prod by the owner AFTER the run, never by the agent.

insert into public.share_tokens (
  id,
  capability_type,
  job_id,
  token,
  recipient_name,
  viewed_at,
  revoked_at,
  expires_at,
  view_count,
  created_at,
  created_by,
  state
)
select
  l.id,
  'schedule',
  l.job_id,
  l.token,
  l.recipient_name,
  l.viewed_at,
  l.revoked_at,
  null,
  0,
  l.created_at,
  l.created_by,
  jsonb_build_object('committedDateSnapshot', to_char(l.committed_date_snapshot, 'YYYY-MM-DD'))
from public.schedule_share_links l
where not exists (
  select 1 from public.share_tokens t where t.token = l.token
);

-- Reload PostgREST schema cache (no-op schema change, but keeps the convention).
notify pgrst, 'reload schema';
