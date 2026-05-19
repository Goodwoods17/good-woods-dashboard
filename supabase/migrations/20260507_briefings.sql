-- Daily briefing rows: one per generation run.
create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  for_date date not null,
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  model text not null,
  jobs_considered int not null default 0,
  error text,
  source text not null default 'cron' -- 'cron' | 'manual'
);

create index if not exists briefings_for_date_idx
  on public.briefings (for_date desc, generated_at desc);

-- RLS: anon can read, only service-role can write.
alter table public.briefings enable row level security;

create policy "anon read briefings"
  on public.briefings for select
  to anon
  using (true);

-- (no insert/update/delete policy for anon — only service role can write)
