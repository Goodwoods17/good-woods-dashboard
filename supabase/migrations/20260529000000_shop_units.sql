-- Shop floor: work units flowing through stations, plus andon events.
-- A work unit is a *piece* of a job (one job spawns several, e.g. uppers + base
-- cabinets), linked to a job by id. Units can sit at different stations at once.
-- Retires the localStorage "gw_shop_v1" store.

create table if not exists public.shop_units (
  id uuid primary key default gen_random_uuid(),
  -- jobs.id is text (human-derived), so job_id matches that type
  job_id text references public.jobs(id) on delete set null,
  description text not null,
  station text not null default 'cut'
    check (station in ('cut', 'assemble', 'finish', 'install')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shop_units is
  'Shop-floor work units (pieces of a job) moving through the four stations';

create index if not exists shop_units_station_idx on public.shop_units (station);
create index if not exists shop_units_job_id_idx on public.shop_units (job_id);

-- Touch updated_at on every write (idempotent: create if not already present)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shop_units_set_updated_at
  before update on public.shop_units
  for each row execute function public.set_updated_at();

alter table public.shop_units enable row level security;

create policy "shop_units_authenticated_all"
  on public.shop_units for all
  to authenticated using (true) with check (true);

create policy "shop_units_anon_none"
  on public.shop_units for all
  to anon using (false) with check (false);

-- Andon: floor-raised issues (Toyota pull-cord). Cross-device so the office
-- desktop and the shop tablet see the same active-issue list.
create table if not exists public.andon_events (
  id uuid primary key default gen_random_uuid(),
  station text not null default 'all'
    check (station in ('cut', 'assemble', 'finish', 'install', 'all')),
  message text not null,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.andon_events is
  'Andon events: floor-raised issues, cross-device';

alter table public.andon_events enable row level security;

create policy "andon_events_authenticated_all"
  on public.andon_events for all
  to authenticated using (true) with check (true);

create policy "andon_events_anon_none"
  on public.andon_events for all
  to anon using (false) with check (false);
