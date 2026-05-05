-- Good Woods Dashboard — M2 schema
-- Single-table design: each row is a job, with nested costs/invoice/activity stored as JSONB.
-- This mirrors the M1 localStorage shape exactly so migration is a straight upsert.
-- Normalisation can come later when M5+ shop-floor analytics demand cross-job queries.

create table if not exists public.jobs (
  id              text primary key,
  code            text        not null,
  name            text        not null,
  client          text        not null,
  address         text        not null,
  template        text        not null,
  pipeline_status text        not null,
  health_status   text        not null,
  current_milestone text      not null,
  install_date    date        not null,
  revenue         numeric     not null default 0,
  costs           jsonb       not null default '[]'::jsonb,
  invoice         jsonb       not null,
  activity        jsonb       not null default '[]'::jsonb,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Touch updated_at on every row update.
create or replace function public.tg_jobs_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tg_jobs_touch_updated on public.jobs;
create trigger tg_jobs_touch_updated
before update on public.jobs
for each row execute function public.tg_jobs_touch_updated();

-- M2 single-user access model:
-- Andrew is the only user, accessing through the anon key. Enable RLS so future
-- multi-user roll-out (M6+ Installer Portal) is gated behind explicit policy
-- changes, but allow full read/write to anon for now.
alter table public.jobs enable row level security;

drop policy if exists "anon read jobs"  on public.jobs;
drop policy if exists "anon write jobs" on public.jobs;

create policy "anon read jobs"
  on public.jobs for select
  to anon
  using (true);

create policy "anon write jobs"
  on public.jobs for insert
  to anon
  with check (true);

create policy "anon update jobs"
  on public.jobs for update
  to anon
  using (true)
  with check (true);

create policy "anon delete jobs"
  on public.jobs for delete
  to anon
  using (true);
