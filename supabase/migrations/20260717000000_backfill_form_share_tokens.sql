-- Project Files & Sharing (Tier-2) · S5b (issue #217, milestone #12, ADR 0022) —
-- RETROFIT the LIVE Forms `/f/<token>` portal onto the generalized `share_tokens`
-- registry. Forms is LIVE in prod (unflagged, no-expiry, write-heavy) — the
-- single riskiest retrofit, so it follows the S5a Scheduling rehearsal and the
-- read+write flip ships in ONE deploy (never staggered).
--
-- This migration BACKFILLS every existing `form_share_links` row into
-- `share_tokens` as a `capability_type = 'form'` row:
--   * instance_id          → form_instance_id (the typed form_instance anchor)
--   * token / recipient_name / viewed_at / revoked_at / created_at / created_by
--                          → copied VERBATIM (viewed_at read-receipts preserved)
--   * submit_ip            → ip      (the shared audit column)
--   * submit_user_agent    → ua      (the shared audit column)
--   * id                   → copied VERBATIM so the dual-written rows stay aligned
--                          row-for-row with the legacy table (revoke-by-id hits both)
--   * expires_at           → NULL (form links never expire), view_count → 0
--   * the form-specific bits the legacy table carried as dedicated columns move
--     into state (camelCase to match ShareTokenState in TS):
--       recipient_type   → state.recipientType   (always present)
--       locked_field_ids → state.lockedFieldIds  (the server-side security gate;
--                          coalesced to [] so it is never null)
--       sent_at          → state.sentAt          (owner-pill stamps; OMITTED when
--       started_at       → state.startedAt        null via jsonb_strip_nulls, so
--       submitted_at     → state.submittedAt      the progress jsonb guard — which
--       progress         → state.progress         requires a number when the key
--                                                  exists — is never tripped)
--
-- IDEMPOTENT: the insert is guarded by `where not exists (… token …)` against the
-- GLOBAL-unique `share_tokens.token`, so re-running it is a no-op and there can be
-- ZERO token collisions (a token already present — from a prior run or a future
-- dual-write — is skipped, never duplicated).
--
-- The legacy `form_share_links` table is LEFT IN PLACE and still dual-written by
-- both the owner store and the public submit/send paths during the overlap; only
-- the READ path is cut to `share_tokens`. The table is dropped in a later cleanup
-- slice — only AFTER a row-for-row verify of all six stamp columns, never here.
--
-- ADDITIVE + idempotent; ships behind NEXT_PUBLIC_PROJECT_FILES_ENABLED (off in
-- prod). Applied to prod by the owner AFTER the run, never by the agent.

insert into public.share_tokens (
  id,
  capability_type,
  form_instance_id,
  token,
  recipient_name,
  viewed_at,
  revoked_at,
  expires_at,
  view_count,
  ip,
  ua,
  created_at,
  created_by,
  state
)
select
  l.id,
  'form',
  l.instance_id,
  l.token,
  l.recipient_name,
  l.viewed_at,
  l.revoked_at,
  null,
  0,
  l.submit_ip,
  l.submit_user_agent,
  l.created_at,
  l.created_by,
  jsonb_strip_nulls(
    jsonb_build_object(
      'recipientType', l.recipient_type,
      'lockedFieldIds', coalesce(l.locked_field_ids, '[]'::jsonb),
      'sentAt', l.sent_at,
      'startedAt', l.started_at,
      'submittedAt', l.submitted_at,
      'progress', l.progress
    )
  )
from public.form_share_links l
where not exists (
  select 1 from public.share_tokens t where t.token = l.token
);

-- Reload PostgREST schema cache (no-op schema change, but keeps the convention).
notify pgrst, 'reload schema';
