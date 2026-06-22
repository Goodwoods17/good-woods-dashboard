-- Cost Codes & Live Job Costing — P1 schema.
-- Spec: docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md (ADRs 0008/0009/0010).
--
-- ALL ADDITIVE: new nullable columns + new tables. Nothing existing changes
-- behaviour, so this is safe to apply ahead of the consumer wiring (P2+).
--
-- NOTE 1 — jobs.id is `text`, so every job FK here is `text` (matching job_trades).
-- NOTE 2 — the labour_sessions.job_id -> jobs(id) FK upgrade (spec §4.7) is NOT in
--   this migration: that column is `uuid` today while jobs.id is `text`, so it needs
--   a uuid->text conversion on existing data first, in its own tested migration.
-- NOTE 3 — the legacy Job.invoice -> job_invoices backfill is also deferred; this
--   creates the empty table. Revenue still reads jobs.revenue (ADR 0010), so nothing
--   depends on job_invoices being populated yet.

-- set_updated_at already exists from earlier migrations; recreate idempotently.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── extend the cost-code registry (labour_operations) ──────────────────

alter table public.labour_operations
  add column if not exists code text,
  add column if not exists driver_unit text
    check (driver_unit is null or driver_unit in ('ea','sqft','lf','bf','sheet','board'));

-- Unique only when set, so the many code-less operations don't collide on null.
create unique index if not exists labour_operations_code_key
  on public.labour_operations (code) where code is not null;

comment on column public.labour_operations.code is
  'Short cost-code identifier (e.g. ASM-BASE). Unique when set. The marker tying estimate <-> timer <-> actuals.';
comment on column public.labour_operations.driver_unit is
  'Optional driver: the unit a code''s time scales with (per-unit averages). Null = a flat, time-only code.';

-- ─── labour_sessions gains a per-driver quantity ────────────────────────

alter table public.labour_sessions
  add column if not exists quantity numeric;

comment on column public.labour_sessions.quantity is
  'Units done this run for a driven code (e.g. sheets cut), captured on Stop. Null for flat codes.';

-- ─── cost_code_templates (+ items) — the estimating bundles ─────────────

create table if not exists public.cost_code_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cost_code_templates is
  'A named bundle of cost codes + budgeted minutes, loaded into an estimate (distinct from the estimator section-templates).';
drop trigger if exists cost_code_templates_set_updated_at on public.cost_code_templates;
create trigger cost_code_templates_set_updated_at
  before update on public.cost_code_templates
  for each row execute function public.set_updated_at();

create table if not exists public.cost_code_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.cost_code_templates(id) on delete cascade,
  code_id uuid references public.labour_operations(id) on delete set null,
  budgeted_minutes numeric,        -- defaults to the code's historical average at load time
  qty numeric not null default 1,
  sort integer not null default 0
);
create index if not exists cost_code_template_items_template_idx
  on public.cost_code_template_items (template_id);

-- ─── job_estimates / job_invoices — light QuickBooks-mappable records ────

create table if not exists public.job_estimates (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  label text not null default '',        -- 'Original' / 'Change order 1'
  estimate_date date,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.job_estimates is
  'A budgeting cycle on a project (original or change order); owns its job_cost_budgets lines. Maps to a QuickBooks Estimate (ADR 0010).';
create index if not exists job_estimates_job_idx on public.job_estimates (job_id);

create table if not exists public.job_invoices (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  number text not null default '',
  issued_date date,
  due_date date,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.job_invoices is
  'A revenue cycle on a project; its amount adds to project revenue. Maps to a QuickBooks Invoice (ADR 0010). Legacy Job.invoice backfill is a later migration.';
create index if not exists job_invoices_job_idx on public.job_invoices (job_id);

-- ─── job_cost_budgets — the frozen baseline ─────────────────────────────
-- Per cost code for labour; per phase for material. Written at Save-as-Job.

create table if not exists public.job_cost_budgets (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  estimate_id uuid references public.job_estimates(id) on delete cascade,
  code_id uuid references public.labour_operations(id) on delete set null,  -- null = phase-level material row
  phase_id text references public.labour_categories(id) on delete set null,
  kind text not null check (kind in ('labour','material')),
  budgeted_quantity numeric,       -- driven codes
  budgeted_minutes numeric,        -- labour
  rate numeric,                    -- labour, snapshot
  budgeted_amount numeric not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.job_cost_budgets is
  'Frozen budget baseline on a job. Labour rows carry a code + minutes x rate; material rows are phase-level. Subtrade budgets are NOT here (read live from job_trades.cost).';
create index if not exists job_cost_budgets_job_idx on public.job_cost_budgets (job_id);
create index if not exists job_cost_budgets_estimate_idx on public.job_cost_budgets (estimate_id);

-- ─── job_cost_actuals — incurred material/subtrade costs ────────────────
-- Labour actuals come from labour_sessions; this is the material/sub ledger.

create table if not exists public.job_cost_actuals (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('material','subtrade','labour_adj')),
  amount numeric not null default 0,
  -- Soft ref (no FK): a catalog_suppliers row when kind='material', a subtrades row
  -- when kind='subtrade'. kind tells you which table. Hardening to FKs is a later option.
  partner_id uuid,
  trade_line_id uuid references public.job_trades(id) on delete set null,
  code_id uuid references public.labour_operations(id) on delete set null,
  phase_id text references public.labour_categories(id) on delete set null,
  actual_date date,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.job_cost_actuals is
  'Logged material/subtrade actuals as they land (a lumber invoice or sub bill). partner_id is a soft ref keyed by kind (Supplier/Subtrade). Maps to a QuickBooks Bill/Expense (ADR 0010).';
create index if not exists job_cost_actuals_job_idx on public.job_cost_actuals (job_id);

-- ─── RLS — authenticated-only on every new table (project pattern) ──────

alter table public.cost_code_templates enable row level security;
alter table public.cost_code_template_items enable row level security;
alter table public.job_estimates enable row level security;
alter table public.job_invoices enable row level security;
alter table public.job_cost_budgets enable row level security;
alter table public.job_cost_actuals enable row level security;

drop policy if exists "cost_code_templates_authenticated_all" on public.cost_code_templates;
create policy "cost_code_templates_authenticated_all"
  on public.cost_code_templates for all to authenticated using (true) with check (true);
drop policy if exists "cost_code_templates_anon_none" on public.cost_code_templates;
create policy "cost_code_templates_anon_none"
  on public.cost_code_templates for all to anon using (false) with check (false);

drop policy if exists "cost_code_template_items_authenticated_all" on public.cost_code_template_items;
create policy "cost_code_template_items_authenticated_all"
  on public.cost_code_template_items for all to authenticated using (true) with check (true);
drop policy if exists "cost_code_template_items_anon_none" on public.cost_code_template_items;
create policy "cost_code_template_items_anon_none"
  on public.cost_code_template_items for all to anon using (false) with check (false);

drop policy if exists "job_estimates_authenticated_all" on public.job_estimates;
create policy "job_estimates_authenticated_all"
  on public.job_estimates for all to authenticated using (true) with check (true);
drop policy if exists "job_estimates_anon_none" on public.job_estimates;
create policy "job_estimates_anon_none"
  on public.job_estimates for all to anon using (false) with check (false);

drop policy if exists "job_invoices_authenticated_all" on public.job_invoices;
create policy "job_invoices_authenticated_all"
  on public.job_invoices for all to authenticated using (true) with check (true);
drop policy if exists "job_invoices_anon_none" on public.job_invoices;
create policy "job_invoices_anon_none"
  on public.job_invoices for all to anon using (false) with check (false);

drop policy if exists "job_cost_budgets_authenticated_all" on public.job_cost_budgets;
create policy "job_cost_budgets_authenticated_all"
  on public.job_cost_budgets for all to authenticated using (true) with check (true);
drop policy if exists "job_cost_budgets_anon_none" on public.job_cost_budgets;
create policy "job_cost_budgets_anon_none"
  on public.job_cost_budgets for all to anon using (false) with check (false);

drop policy if exists "job_cost_actuals_authenticated_all" on public.job_cost_actuals;
create policy "job_cost_actuals_authenticated_all"
  on public.job_cost_actuals for all to authenticated using (true) with check (true);
drop policy if exists "job_cost_actuals_anon_none" on public.job_cost_actuals;
create policy "job_cost_actuals_anon_none"
  on public.job_cost_actuals for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
