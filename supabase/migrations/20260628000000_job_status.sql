-- Job Status (live job progress) — slice 1 tracer schema + infra.
-- See features/job-status/CLAUDE.md + CONTEXT.md and issue #57. Architecture A★:
-- each trackable item lives in exactly one home table; a read-layer adapter
-- presents one model (job_items + Drawings job_pieces) — no data duplication.
--
-- Status / visibility / source vocabularies are validated in TypeScript (string
-- unions, see lib/types.ts), NOT DB enums, so they can evolve without a
-- migration — mirrors the forms + invoices features. RLS = authenticated-only +
-- anon-none on every new table and the bucket.
--
-- MANDATORY overnight-build constraints (feature spec): additive-only
-- (CREATE / nullable-or-defaulted ADD COLUMN), never weakens existing RLS or
-- Drawings behaviour, applied to prod by the owner AFTER review. The /status
-- route + nav are flag-gated OFF in prod (NEXT_PUBLIC_JOB_STATUS_ENABLED).

-- ─── phase_step_templates (standard steps per phase; doubles as an SOP) ───────
create table if not exists public.phase_step_templates (
  id                 uuid primary key default gen_random_uuid(),
  phase              text not null,
  label              text not null,
  sort_order         int not null default 0,
  default_visibility text not null default 'owner',
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists phase_step_templates_phase_idx
  on public.phase_step_templates (phase, sort_order);

-- ─── job_items (per-job trackable steps — template + ad-hoc; NOT pieces) ──────
create table if not exists public.job_items (
  id                uuid primary key default gen_random_uuid(),
  job_id            text not null,
  phase             text not null,
  label             text not null,
  -- 'template' | 'adhoc' — validated in TS, not a DB enum.
  source            text not null default 'adhoc',
  template_id       uuid references public.phase_step_templates(id) on delete set null,
  -- not_started | in_progress | blocked | done — validated in TS.
  status            text not null default 'not_started',
  -- owner | client | both. Stored from day one; an enforced boundary only when
  -- the client portal layer ships (a pure read filter, no schema change).
  visibility        text not null default 'owner',
  sort_order        int not null default 0,
  status_updated_at timestamptz,
  status_updated_by text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists job_items_job_idx on public.job_items (job_id, phase, sort_order);

-- ─── job_item_events (append-only timeline: status change / note / photo) ─────
create table if not exists public.job_item_events (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null,
  -- 'job_item' | 'piece' — which home table item_id points at (validated in TS).
  item_kind   text not null,
  item_id     text not null,
  -- 'status_change' | 'note' | 'photo' — validated in TS.
  event_type  text not null,
  to_status   text,
  note        text,
  photo_path  text,
  visibility  text not null default 'owner',
  worker_id   text,
  created_at  timestamptz not null default now()
);
create index if not exists job_item_events_job_idx
  on public.job_item_events (job_id, created_at desc);
create index if not exists job_item_events_item_idx
  on public.job_item_events (item_kind, item_id, created_at desc);

-- ─── Extend Drawings pieces: add visibility (additive, NOT NULL DEFAULT) ──────
-- The Drawings table is public.job_pieces. This is the ONLY change to existing
-- Drawings schema/behaviour — additive + safe, never a destructive alter.
alter table public.job_pieces
  add column if not exists visibility text not null default 'owner';

-- ─── updated_at trigger on job_items (reuse the hardened set_updated_at()) ────
drop trigger if exists job_items_set_updated_at on public.job_items;
create trigger job_items_set_updated_at
  before update on public.job_items
  for each row execute function public.set_updated_at();

-- ─── RLS: authenticated-all + anon-none (the security boundary) ──────────────
alter table public.phase_step_templates enable row level security;
drop policy if exists phase_step_templates_authenticated_all on public.phase_step_templates;
create policy phase_step_templates_authenticated_all on public.phase_step_templates
  for all to authenticated using (true) with check (true);
drop policy if exists phase_step_templates_anon_none on public.phase_step_templates;
create policy phase_step_templates_anon_none on public.phase_step_templates
  for all to anon using (false) with check (false);

alter table public.job_items enable row level security;
drop policy if exists job_items_authenticated_all on public.job_items;
create policy job_items_authenticated_all on public.job_items
  for all to authenticated using (true) with check (true);
drop policy if exists job_items_anon_none on public.job_items;
create policy job_items_anon_none on public.job_items
  for all to anon using (false) with check (false);

alter table public.job_item_events enable row level security;
drop policy if exists job_item_events_authenticated_all on public.job_item_events;
create policy job_item_events_authenticated_all on public.job_item_events
  for all to authenticated using (true) with check (true);
drop policy if exists job_item_events_anon_none on public.job_item_events;
create policy job_item_events_anon_none on public.job_item_events
  for all to anon using (false) with check (false);

-- ─── Realtime: job_items pushes live status cycles to every client ───────────
-- Supabase Realtime is the always-on push engine (no home server). Wrapped so a
-- replay onto a project where the table is already published is a no-op.
do $$
begin
  alter publication supabase_realtime add table public.job_items;
exception
  when duplicate_object then null;
end $$;

-- ─── Private Storage bucket for field photos (consumed in slice 3) ───────────
-- Mirrors the invoices / job-documents posture: private, never anon-readable,
-- every op gated to authenticated.
insert into storage.buckets (id, name, public)
values ('job-progress', 'job-progress', false)
on conflict (id) do nothing;

drop policy if exists job_progress_bucket_read   on storage.objects;
drop policy if exists job_progress_bucket_insert on storage.objects;
drop policy if exists job_progress_bucket_update on storage.objects;
drop policy if exists job_progress_bucket_delete on storage.objects;
create policy job_progress_bucket_read on storage.objects
  for select to authenticated using (bucket_id = 'job-progress');
create policy job_progress_bucket_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'job-progress');
create policy job_progress_bucket_update on storage.objects
  for update to authenticated using (bucket_id = 'job-progress') with check (bucket_id = 'job-progress');
create policy job_progress_bucket_delete on storage.objects
  for delete to authenticated using (bucket_id = 'job-progress');
