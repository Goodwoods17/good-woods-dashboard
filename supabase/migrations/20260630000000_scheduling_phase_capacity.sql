-- Scheduling & Client-Commitment Engine — S2 phase-level capacity (issue #90).
--
-- The six MilestoneStage phases double as shop WORK-CENTERS. This table stores
-- each phase's weekly active-time CAPACITY (hours); the LOAD side is derived at
-- read time from `labour_sessions` active-time history (no storage needed), and
-- a new job's default phase durations are seeded from that same history.
--
-- Additive + seeded for the six phases, so existing rows/queries are untouched.
-- RLS authenticated-only, matching the labour_* tables it reads alongside.
--
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod) — schema can land
-- staged while the UI stays dormant. Apply via the Supabase MCP / SQL editor,
-- then reload the PostgREST cache.

-- set_updated_at already exists from earlier migrations; recreate idempotently.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.scheduling_phase_capacity (
  -- The phase slug = a MilestoneStage = a labour_categories.id (design/cnc/
  -- assembly/finishing/delivery/install). One row per work-center.
  phase text primary key
    check (phase in ('design', 'cnc', 'assembly', 'finishing', 'delivery', 'install')),
  weekly_capacity_hours numeric not null default 40 check (weekly_capacity_hours >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.scheduling_phase_capacity is
  'Per-phase weekly active-time capacity (hours) for the schedule capacity/load model. Phases double as work-centers; load is derived from labour_sessions at read time (not stored). Editable data, not enum.';
comment on column public.scheduling_phase_capacity.weekly_capacity_hours is
  'Hours of active shop time this phase work-center can absorb per week. Seeded at 40 (one full week); owner tunes later.';

drop trigger if exists scheduling_phase_capacity_set_updated_at on public.scheduling_phase_capacity;
create trigger scheduling_phase_capacity_set_updated_at
  before update on public.scheduling_phase_capacity
  for each row execute function public.set_updated_at();

-- Seed all six work-centers with a sane one-week-of-shop-time default.
insert into public.scheduling_phase_capacity (phase, weekly_capacity_hours) values
  ('design',    40),
  ('cnc',       40),
  ('assembly',  40),
  ('finishing', 40),
  ('delivery',  40),
  ('install',   40)
on conflict (phase) do nothing;

alter table public.scheduling_phase_capacity enable row level security;

drop policy if exists "scheduling_phase_capacity_authenticated_all" on public.scheduling_phase_capacity;
create policy "scheduling_phase_capacity_authenticated_all"
  on public.scheduling_phase_capacity for all to authenticated using (true) with check (true);
drop policy if exists "scheduling_phase_capacity_anon_none" on public.scheduling_phase_capacity;
create policy "scheduling_phase_capacity_anon_none"
  on public.scheduling_phase_capacity for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
