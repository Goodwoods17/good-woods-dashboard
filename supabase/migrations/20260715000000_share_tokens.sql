-- Project Files & Sharing (Tier-2) · S1 (tracer) — the generalized
-- `share_tokens` capability registry. ADR 0022.
--
-- Today the no-login "capability link" portals exist TWICE with one column
-- contract and one read helper (`loadCapabilityRow`):
--   * Forms      → form_share_links   (anchor: form_instances)  /f/<token>
--   * Scheduling → schedule_share_links (anchor: jobs)          /s/<token>
-- Tier-2 adds a third capability type (document view) and a fourth that WRITES
-- (designer upload / file request). Rather than add two more per-feature
-- `*_share_links` tables, this slice introduces ONE generalized registry that
-- every sharing slice rides; the two existing tables are retrofitted onto it
-- later (S5a Scheduling rehearsal → S5b Forms live), never big-bang.
--
-- This migration is ADDITIVE (a brand-new table; the live form_share_links /
-- schedule_share_links are untouched) and ships behind
-- NEXT_PUBLIC_PROJECT_FILES_ENABLED (OFF in prod) — nothing reads it until the
-- owner flips the flag after review.
--
-- Anchors are typed *nullable* FK columns (not a polymorphic resource_type +
-- text id) so each retains its ON DELETE CASCADE cleanup and so a typed read can
-- reject a foreign-type token. jobs.id is TEXT in this project (not uuid); the
-- job_id FK column matches. form_instances.id and documents.id are uuid. A
-- `capability_type` discriminator + a CHECK that EXACTLY ONE anchor is set keeps
-- a row well-formed.
--
-- RLS: canonical authenticated_all + anon_none. The public read/write path never
-- touches the anon client — it uses the SERVICE ROLE scoped to the one row
-- behind the opaque token. The *_anon_none policy denies anon entirely.

create table if not exists public.share_tokens (
  id                uuid primary key default gen_random_uuid(),

  -- Discriminator (validated in TS): document_view | document_request | form | schedule
  capability_type   text not null,

  -- Typed nullable FK anchors — EXACTLY ONE is set (enforced by the CHECK below).
  form_instance_id  uuid references public.form_instances(id) on delete cascade,
  job_id            text references public.jobs(id)           on delete cascade,
  document_id       uuid references public.documents(id)      on delete cascade,

  -- Shared typed columns the generic contract reads by name.
  token             text not null unique,           -- opaque base64url, >=32 bytes; the only key
  recipient_name    text,
  viewed_at         timestamptz,
  revoked_at        timestamptz,
  expires_at        timestamptz,                     -- NULL = never expires (opt-in)
  view_count        integer not null default 0,
  ip                text,                            -- audit: requester IP (server-set, never client-supplied)
  ua                text,                            -- audit: requester User-Agent (server-set)
  created_at        timestamptz not null default now(),
  created_by        text,

  -- Type-specific bits live in jsonb so a new capability type needs no migration:
  -- locked_field_ids, committed_date_snapshot, progress, requested-files,
  -- notification prefs, etc. `locked_field_ids` defaults to [] because it is the
  -- server-side security gate (a missing lock list must mean "lock nothing",
  -- explicitly, not null).
  state             jsonb not null default '{}'::jsonb,

  -- Exactly one anchor per row, paired to its capability_type. document_view and
  -- document_request both anchor on a document; form on a form_instance;
  -- schedule on a job.
  constraint share_tokens_exactly_one_anchor check (
    (case when form_instance_id is not null then 1 else 0 end)
  + (case when job_id           is not null then 1 else 0 end)
  + (case when document_id       is not null then 1 else 0 end)
    = 1
  ),

  -- Re-add the guards that were column-level on the legacy tables and would
  -- otherwise be lost in the move to jsonb:
  --   * progress (when present) stays 0..100
  --   * locked_field_ids (when present) is a json array
  constraint share_tokens_progress_range check (
    state -> 'progress' is null
    or (jsonb_typeof(state -> 'progress') = 'number'
        and (state ->> 'progress')::numeric >= 0
        and (state ->> 'progress')::numeric <= 100)
  ),
  constraint share_tokens_locked_field_ids_is_array check (
    state -> 'locked_field_ids' is null
    or jsonb_typeof(state -> 'locked_field_ids') = 'array'
  )
);

-- One GLOBAL unique index on token: a token resolves to exactly one row across
-- every capability type (the typed read then asserts the row's capability_type).
create unique index if not exists share_tokens_token_idx
  on public.share_tokens (token);

-- Anchor lookups (list every share for a form / job / document).
create index if not exists share_tokens_form_instance_idx
  on public.share_tokens (form_instance_id) where form_instance_id is not null;
create index if not exists share_tokens_job_idx
  on public.share_tokens (job_id) where job_id is not null;
create index if not exists share_tokens_document_idx
  on public.share_tokens (document_id) where document_id is not null;
create index if not exists share_tokens_capability_type_idx
  on public.share_tokens (capability_type);

comment on table public.share_tokens is
  'ADR 0022: generalized no-login capability-link registry. One opaque token per row = a no-login capability (document_view | document_request | form | schedule) scoped to EXACTLY ONE anchor (form_instance_id / job_id / document_id, each ON DELETE CASCADE). Read via the SERVICE ROLE scoped by token; anon is denied entirely. expires_at NULL = never. state jsonb carries type-specific bits (locked_field_ids, committed_date_snapshot, progress, requested files, notification prefs). Ships behind NEXT_PUBLIC_PROJECT_FILES_ENABLED (off in prod).';

-- ─── RLS: canonical *_authenticated_all + *_anon_none ───────────────────────
alter table public.share_tokens enable row level security;

drop policy if exists share_tokens_authenticated_all on public.share_tokens;
create policy share_tokens_authenticated_all on public.share_tokens
  for all to authenticated using (true) with check (true);

drop policy if exists share_tokens_anon_none on public.share_tokens;
create policy share_tokens_anon_none on public.share_tokens
  for all to anon using (false) with check (false);

-- Reload PostgREST schema cache so the new table is queryable now.
notify pgrst, 'reload schema';
