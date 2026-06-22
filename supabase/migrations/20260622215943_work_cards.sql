-- Slice B Part 1 — shop-floor capture. Additive + idempotent.
-- work_cards: a task on the 6-phase board, linked to a cost code (operation).
create table if not exists public.work_cards (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  phase_id text not null references public.labour_categories(id) on delete restrict,
  operation_id uuid references public.labour_operations(id) on delete set null,  -- null = uncoded
  description text not null default '',
  target_quantity numeric,
  assignee_id uuid references public.labour_workers(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','doing','stuck','done')),
  stuck_reason text,
  source text not null default 'manual' check (source in ('budget','template','manual')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.work_cards is
  'A task on the shop-floor board (Slice B): linked to a cost code (operation_id) on a job. Sessions log time against it.';
create index if not exists work_cards_job_idx on public.work_cards (job_id);
create index if not exists work_cards_phase_idx on public.work_cards (phase_id);

drop trigger if exists work_cards_set_updated_at on public.work_cards;
create trigger work_cards_set_updated_at
  before update on public.work_cards
  for each row execute function public.set_updated_at();

-- labour_sessions: link a session to its card; fix job_id uuid -> text (0 rows, trivial).
alter table public.labour_sessions
  add column if not exists card_id uuid references public.work_cards(id) on delete set null;
alter table public.labour_sessions
  alter column job_id type text using job_id::text;

-- RLS
alter table public.work_cards enable row level security;
drop policy if exists "work_cards_authenticated_all" on public.work_cards;
create policy "work_cards_authenticated_all"
  on public.work_cards for all to authenticated using (true) with check (true);
drop policy if exists "work_cards_anon_none" on public.work_cards;
create policy "work_cards_anon_none"
  on public.work_cards for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
