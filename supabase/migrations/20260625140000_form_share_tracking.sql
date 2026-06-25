-- Forms P2 · Slice 3 — owner tracking (sent/opened/started/submitted) +
-- signature audit trail. See features/forms/CLAUDE.md (Phase 2) + issue #42.
--
-- ADDITIVE ONLY. Every column is nullable / defaulted, so the migration is safe
-- to apply to a populated prod table (no backfill, no lock beyond the metadata
-- add). `sent_at` / `viewed_at` / `submitted_at` already exist from the slice-1
-- token model (20260625130000_form_share.sql); we add only what's missing:
--
--   started_at  — stamped server-side the first time the recipient changes any
--                 answer on /f/<token> (between "opened" and "submitted").
--   progress    — owner-visible completion %, 0..100, recomputed on each submit.
--
-- Signature audit trail (dispute-proofing the client signoff). The typed signer
-- name + signed_at already live in the signature FIELD's config (slice 3 of
-- Phase 1). These columns add the quiet server-side capture the owner never has
-- to ask for: who affirmed, from where, with what client.
--
--   signature_affirmed  — the "I confirm" checkbox state at submit time.
--   signed_ip           — request IP captured server-side (never shown to client).
--   signed_user_agent   — request UA captured server-side.
--
-- RLS is unchanged: form_share_links is already authenticated_all + anon_none;
-- the public /f/<token> path writes these via the service role scoped to the
-- one link behind the token.

alter table public.form_share_links
  add column if not exists started_at         timestamptz,
  add column if not exists progress           integer,
  add column if not exists signature_affirmed boolean,
  add column if not exists signed_ip          text,
  add column if not exists signed_user_agent  text;

-- Keep progress a sane percentage if ever set (owner-visible; not a money field).
alter table public.form_share_links
  drop constraint if exists form_share_links_progress_range;
alter table public.form_share_links
  add constraint form_share_links_progress_range
  check (progress is null or (progress >= 0 and progress <= 100));
