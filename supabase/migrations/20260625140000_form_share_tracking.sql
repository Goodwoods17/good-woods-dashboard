-- Forms P2 · Slice 3 — owner tracking + signature audit trail (issue #42).
--
-- Purely ADDITIVE columns on form_share_links. `sent_at` / `viewed_at` /
-- `submitted_at` already exist from Slice 1 (20260625130000_form_share.sql);
-- this migration adds only what's missing:
--
--   started_at  — stamped server-side the first time the recipient persists
--                 ANY answer through the /f/<token> submit route. Feeds the
--                 owner-only pill's intermediate "Started" state.
--   progress    — owner-visible completion %, 0..100, recomputed server-side on
--                 each submit (filled / answerable fields). NULL until first save.
--   submit_ip   — the recipient's IP at submit time (audit trail; server-set).
--   submit_user_agent — the recipient's User-Agent at submit time (audit trail).
--
-- The IP/UA pair makes a client signature dispute-resistant: it is logged
-- QUIETLY server-side (never shown on the public page, never client-supplied).
-- All new columns are nullable with no default → safe on the existing rows.
--
-- No RLS change: form_share_links stays authenticated_all + anon_none. The
-- public read/write path uses the SERVICE ROLE (scoped by token), so it bypasses
-- RLS by design; the new columns are owner-private exactly like the rest.

alter table public.form_share_links
  add column if not exists started_at        timestamptz,
  add column if not exists progress          integer,
  add column if not exists submit_ip         text,
  add column if not exists submit_user_agent text;

-- Guard the progress range so a bad write can never store a nonsense percentage.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'form_share_links_progress_range'
  ) then
    alter table public.form_share_links
      add constraint form_share_links_progress_range
      check (progress is null or (progress >= 0 and progress <= 100));
  end if;
end $$;
