-- job_blockers: structured external blockers (ADR 0013). Source of truth for a
-- job's externally-blocked health. job_id is text (jobs PK is text).
create table if not exists public.job_blockers (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  reason text not null,
  waiting_on_contact_id uuid references public.contacts(id) on delete set null,
  waiting_on_label text,
  gated_phase_id text,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_blockers_active_idx
  on public.job_blockers (job_id) where resolved_at is null;

alter table public.job_blockers enable row level security;
do $$ begin
  create policy "job_blockers_auth_all" on public.job_blockers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
