-- Forms P2 · Slice 1 — token model for the no-login client fill portal.
-- See features/forms/CLAUDE.md (Phase 2 section) + issue #40.
--
-- A `form_share_link` belongs to a single recipient (not the bare instance), so
-- one form_instance can have MANY links — multi-recipient from the start. The
-- token is the only key: an opaque random string, NO expiry (jobs outlast 30
-- days), reusable until manually revoked (`revoked_at`). Save-and-resume falls
-- out of the reusable token (partial answers persist; reopen the same link).
--
-- `recipient_type` is validated in TypeScript (designer/customer/other), NOT a
-- DB enum — mirrors the field-type registry pattern so the vocabulary evolves
-- without a migration. `locked_field_ids` is a per-recipient lock list; the
-- public route ENFORCES it server-side (the token holder can never edit a locked
-- field), not just hides it in the UI.
--
-- RLS: canonical authenticated_all + anon_none. The public read/write path never
-- touches the anon client — it uses the SERVICE ROLE scoped to the one instance
-- behind the token (in src/app/f/[token]/). Reuses the hardened set_updated_at().

create table if not exists public.form_share_links (
  id              uuid primary key default gen_random_uuid(),
  instance_id     uuid not null references public.form_instances(id) on delete cascade,
  token           text not null unique,            -- opaque random, >=32 chars; the only key
  recipient_name  text,
  recipient_type  text not null default 'other',   -- RecipientType, validated in TS
  locked_field_ids jsonb not null default '[]'::jsonb,  -- per-recipient read-only field ids
  sent_at         timestamptz,
  viewed_at       timestamptz,
  submitted_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      text
);
create index if not exists form_share_links_instance_idx
  on public.form_share_links (instance_id);
create unique index if not exists form_share_links_token_idx
  on public.form_share_links (token);

drop trigger if exists form_share_links_set_updated_at on public.form_share_links;
-- No updated_at column here (the lifecycle is captured by the *_at stamps), so
-- no set_updated_at trigger — the table is append-mostly + status-stamp updates.

-- ─── RLS: canonical *_authenticated_all + *_anon_none ───────────────────────
alter table public.form_share_links enable row level security;
drop policy if exists form_share_links_authenticated_all on public.form_share_links;
create policy form_share_links_authenticated_all on public.form_share_links
  for all to authenticated using (true) with check (true);
drop policy if exists form_share_links_anon_none on public.form_share_links;
create policy form_share_links_anon_none on public.form_share_links
  for all to anon using (false) with check (false);
