-- Shop Labour — time-and-motion tracking, deliberately SEPARATE from the price-
-- book Catalog (the Catalog answers "what does it cost?", this answers "where
-- does our shop time go?"). Live start/stop timers log into an event log of
-- sessions tagged by operation × category × worker, optionally linked to a job;
-- aggregated into per-operation / per-category / per-worker averages for a
-- bottleneck finder, and fed back (with approval) into the estimator's
-- catalog_cabinet_types minute defaults.
--
-- Categories AND operations are editable/addable at runtime (data, not enums) —
-- unforeseen steps slot in with no migration.

-- set_updated_at already exists from earlier migrations; recreate idempotently.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── labour_categories — the rollup buckets (editable) ──────────────────

create table if not exists public.labour_categories (
  id text primary key,           -- slug; user-added categories get a generated slug
  label text not null default '',
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.labour_categories is
  'Editable labour rollup buckets (Design/CNC/Assembly/Finishing/Delivery/Install + any added later). The bottleneck view groups by these.';

drop trigger if exists labour_categories_set_updated_at on public.labour_categories;
create trigger labour_categories_set_updated_at
  before update on public.labour_categories
  for each row execute function public.set_updated_at();

insert into public.labour_categories (id, label, sort) values
  ('design',    'Design',    10),
  ('cnc',       'CNC / Cut', 20),
  ('assembly',  'Assembly',  30),
  ('finishing', 'Finishing', 40),
  ('delivery',  'Delivery',  50),
  ('install',   'Install',   60)
on conflict (id) do nothing;

-- ─── labour_operations — the named work items (editable) ────────────────

create table if not exists public.labour_operations (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  category_id text references public.labour_categories(id) on delete set null,
  -- When an operation maps to assembling a cabinet type, this drives the
  -- estimator auto-suggest (actual minutes vs catalog_cabinet_types defaults).
  cabinet_type text check (cabinet_type is null or cabinet_type in ('base','wall','tall','island')),
  default_minutes numeric,       -- optional expected minutes (a starting estimate)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.labour_operations is
  'Named work items time is logged against (e.g. "Assemble base cabinet"). cabinet_type links assembly ops to the estimator minute defaults.';

create index if not exists labour_operations_category_idx on public.labour_operations (category_id);
create index if not exists labour_operations_active_idx on public.labour_operations (active);

drop trigger if exists labour_operations_set_updated_at on public.labour_operations;
create trigger labour_operations_set_updated_at
  before update on public.labour_operations
  for each row execute function public.set_updated_at();

insert into public.labour_operations (name, category_id, cabinet_type, default_minutes) values
  ('Assemble base cabinet',     'assembly',  'base',   60),
  ('Assemble wall cabinet',     'assembly',  'wall',   45),
  ('Assemble tall / pantry',    'assembly',  'tall',   90),
  ('Assemble island',           'assembly',  'island', 90),
  ('CNC cut sheet goods',       'cnc',        null,    null),
  ('Edgeband + prep',           'cnc',        null,    null),
  ('Spray finish (per batch)',  'finishing',  null,    null),
  ('Load truck',                'delivery',   null,    null),
  ('Install — uppers',          'install',    null,    null),
  ('Install — bases',           'install',    null,    null),
  ('Design / measure',          'design',     null,    null)
on conflict do nothing;

-- ─── labour_workers — who logs time (named roster) ──────────────────────

create table if not exists public.labour_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.labour_workers is
  'Editable roster; each timed session records who ran it so the bottleneck finder can split by person.';

drop trigger if exists labour_workers_set_updated_at on public.labour_workers;
create trigger labour_workers_set_updated_at
  before update on public.labour_workers
  for each row execute function public.set_updated_at();

insert into public.labour_workers (name) values ('Andrew') on conflict do nothing;

-- ─── labour_sessions — the timed event log ──────────────────────────────

create table if not exists public.labour_sessions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references public.labour_operations(id) on delete set null,
  -- Category snapshot at start, so re-categorising an operation later never
  -- rewrites history.
  category_id text references public.labour_categories(id) on delete set null,
  worker_id uuid references public.labour_workers(id) on delete set null,
  job_id uuid,                   -- soft ref to a job (no FK — keeps labour decoupled)
  started_at timestamptz not null default now(),
  ended_at timestamptz,          -- null = still running
  note text,
  created_at timestamptz not null default now()
);

comment on table public.labour_sessions is
  'Append-only-ish event log: one row per timed run of an operation. ended_at null = running. Aggregated into per-operation/category/worker averages.';

create index if not exists labour_sessions_running_idx on public.labour_sessions (ended_at);
create index if not exists labour_sessions_operation_idx on public.labour_sessions (operation_id);
create index if not exists labour_sessions_category_idx on public.labour_sessions (category_id);
create index if not exists labour_sessions_started_idx on public.labour_sessions (started_at desc);
create index if not exists labour_sessions_job_idx on public.labour_sessions (job_id);

-- ─── RLS — authenticated-only, matching the project pattern ─────────────

alter table public.labour_categories enable row level security;
alter table public.labour_operations enable row level security;
alter table public.labour_workers enable row level security;
alter table public.labour_sessions enable row level security;

drop policy if exists "labour_categories_authenticated_all" on public.labour_categories;
create policy "labour_categories_authenticated_all"
  on public.labour_categories for all to authenticated using (true) with check (true);
drop policy if exists "labour_categories_anon_none" on public.labour_categories;
create policy "labour_categories_anon_none"
  on public.labour_categories for all to anon using (false) with check (false);

drop policy if exists "labour_operations_authenticated_all" on public.labour_operations;
create policy "labour_operations_authenticated_all"
  on public.labour_operations for all to authenticated using (true) with check (true);
drop policy if exists "labour_operations_anon_none" on public.labour_operations;
create policy "labour_operations_anon_none"
  on public.labour_operations for all to anon using (false) with check (false);

drop policy if exists "labour_workers_authenticated_all" on public.labour_workers;
create policy "labour_workers_authenticated_all"
  on public.labour_workers for all to authenticated using (true) with check (true);
drop policy if exists "labour_workers_anon_none" on public.labour_workers;
create policy "labour_workers_anon_none"
  on public.labour_workers for all to anon using (false) with check (false);

drop policy if exists "labour_sessions_authenticated_all" on public.labour_sessions;
create policy "labour_sessions_authenticated_all"
  on public.labour_sessions for all to authenticated using (true) with check (true);
drop policy if exists "labour_sessions_anon_none" on public.labour_sessions;
create policy "labour_sessions_anon_none"
  on public.labour_sessions for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
