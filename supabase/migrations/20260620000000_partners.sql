-- Partners (Phase 0) → supplier + subtrade profiles and project trade-lines.
--
-- See docs/decisions/0007-subtrades-partners-and-trade-lines.md and
-- features/partners/CLAUDE.md. Parties are separated by what we pay them FOR:
-- clients live in public.contacts; suppliers reuse + enrich public.catalog_suppliers
-- (paid for goods); subtrades are a new table (paid for labour on a job).
--
-- Additive only. Apply with: mcp__supabase__apply_migration.
-- RLS = authenticated-only, matching the catalog multi-supplier pattern.

-- ─── trades — the discipline registry (Settings-managed) ────────────────
-- The taxonomy of disciplines a subtrade can practise. Each carries a colour
-- (a --trade-* palette slug, see DESIGN.md §2 "Categorical (Trade) Palette"),
-- a Lucide icon key, and a "suggested by default" flag that drives the
-- tap-to-add strip on the project Trades card. New trades are rows, not code.

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                       -- stable slug, e.g. 'installer'
  label text not null default '',                 -- display label, e.g. 'Installer'
  color text not null default 'other',            -- --trade-<color> palette slug
  icon text not null default 'shapes',            -- Lucide icon key
  is_suggested_default boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,           -- soft-delete (hide without breaking lines)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trades is
  'Discipline registry for subtrades (installer, finisher, electrical…). color = --trade-* palette slug; icon = Lucide key; is_suggested_default drives the project Trades-card suggestion strip.';

create index if not exists trades_sort_idx on public.trades (sort_order);

drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

insert into public.trades (key, label, color, icon, is_suggested_default, sort_order) values
  ('installer',  'Installer',  'installer',  'wrench',       true,  0),
  ('finisher',   'Finisher',   'finisher',   'paint-roller', true,  1),
  ('countertop', 'Countertop', 'countertop', 'square',       true,  2),
  ('electrical', 'Electrical', 'electrical', 'zap',          false, 3),
  ('plumbing',   'Plumbing',   'plumbing',   'droplet',      false, 4),
  ('delivery',   'Delivery',   'delivery',   'truck',        true,  5),
  ('upholstery', 'Upholstery', 'upholstery', 'armchair',     false, 6),
  ('other',      'Other',      'other',      'shapes',       false, 7)
on conflict (key) do nothing;

-- ─── subtrades — external companies/people we hire for a job ─────────────
-- A subtrade is paid for LABOUR (distinct from a supplier, paid for goods, and
-- from in-house crew, who are employees/Users). One main contact embedded on
-- the row (no CRM-contacts link in v1). trade_id is its PRIMARY discipline;
-- the trade actually performed lives per-assignment on job_trades.

create table if not exists public.subtrades (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  trade_id uuid references public.trades(id) on delete set null,  -- primary discipline
  contact_name text,
  phone text,
  email text,
  address text,
  typical_rate_note text,                          -- free text, NOT a money field
  notes text,
  active boolean not null default true,            -- soft-delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subtrades is
  'External companies/people hired to perform work on a job (install, finishing, electrical…). Paid for labour. Embedded contact; trade_id = primary discipline.';

create index if not exists subtrades_name_idx on public.subtrades (name);
create index if not exists subtrades_trade_idx on public.subtrades (trade_id);
create index if not exists subtrades_active_idx on public.subtrades (active) where active = true;

drop trigger if exists subtrades_set_updated_at on public.subtrades;
create trigger subtrades_set_updated_at
  before update on public.subtrades
  for each row execute function public.set_updated_at();

-- ─── job_trades — the trade-lines on a project ──────────────────────────
-- A trade a project NEEDS. subtrade_id is nullable: a line can be "needed, not
-- yet assigned" (TBD). Many-to-many (a job has installer + finisher; a subtrade
-- works many jobs). cost is captured-not-rolled-up (no v1 financial summaries).

create table if not exists public.job_trades (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete restrict,
  subtrade_id uuid references public.subtrades(id) on delete set null,  -- null = TBD
  status text not null default 'needed' check (status in ('needed', 'booked', 'done')),
  cost numeric,                                    -- optional; captured, not summed in v1
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.job_trades is
  'Trade-lines on a project: a trade the job needs, optionally filled by a subtrade (null = TBD). cost is captured-not-rolled-up in v1.';

create index if not exists job_trades_job_idx on public.job_trades (job_id);
create index if not exists job_trades_subtrade_idx on public.job_trades (subtrade_id);
create index if not exists job_trades_trade_idx on public.job_trades (trade_id);

drop trigger if exists job_trades_set_updated_at on public.job_trades;
create trigger job_trades_set_updated_at
  before update on public.job_trades
  for each row execute function public.set_updated_at();

-- ─── catalog_suppliers — enrich for a profile (additive columns) ─────────
-- The supplier profile reuses this table (ADR 0007). It already has name,
-- website, notes, cart_config, contact_id; add the missing profile fields.

alter table public.catalog_suppliers
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists account_number text,
  add column if not exists lead_time_note text,
  add column if not exists active boolean not null default true;

comment on column public.catalog_suppliers.active is 'Soft-delete: false drops the supplier from lists but keeps offers/history resolvable.';

-- ─── RLS — authenticated-only ───────────────────────────────────────────

alter table public.trades enable row level security;
alter table public.subtrades enable row level security;
alter table public.job_trades enable row level security;

drop policy if exists "trades_authenticated_all" on public.trades;
create policy "trades_authenticated_all"
  on public.trades for all to authenticated using (true) with check (true);
drop policy if exists "trades_anon_none" on public.trades;
create policy "trades_anon_none"
  on public.trades for all to anon using (false) with check (false);

drop policy if exists "subtrades_authenticated_all" on public.subtrades;
create policy "subtrades_authenticated_all"
  on public.subtrades for all to authenticated using (true) with check (true);
drop policy if exists "subtrades_anon_none" on public.subtrades;
create policy "subtrades_anon_none"
  on public.subtrades for all to anon using (false) with check (false);

drop policy if exists "job_trades_authenticated_all" on public.job_trades;
create policy "job_trades_authenticated_all"
  on public.job_trades for all to authenticated using (true) with check (true);
drop policy if exists "job_trades_anon_none" on public.job_trades;
create policy "job_trades_anon_none"
  on public.job_trades for all to anon using (false) with check (false);

-- Reload PostgREST schema cache so the new tables/columns are usable immediately.
notify pgrst, 'reload schema';
