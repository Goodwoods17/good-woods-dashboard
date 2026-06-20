-- Partners (Phase 1.5) → people with roles per company, and person-on-trade-line.
--
-- Per ADR 0007 addendum (2026-06-20): a supplier or subtrade has many people, each
-- with a role; a project trade-line can be assigned to a specific person, not just
-- the company. Vendors stay out of the CRM contacts table; this is their own people
-- list. Supersedes the embedded contact_name/phone/email columns (left inert).
-- Additive only. Apply with: mcp__supabase__apply_migration.

-- ─── partner_people — individuals at a supplier or subtrade ──────────────
-- Keyed to exactly one parent (supplier OR subtrade) via the check constraint.

create table if not exists public.partner_people (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.catalog_suppliers(id) on delete cascade,
  subtrade_id uuid references public.subtrades(id) on delete cascade,
  name text not null default '',
  role text,                                  -- free text: owner, estimator, installer, foreman...
  phone text,
  email text,
  is_primary boolean not null default false,  -- the default "who to call" (one per company, app-enforced)
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_people_one_parent check (
    (supplier_id is not null)::int + (subtrade_id is not null)::int = 1
  )
);

comment on table public.partner_people is
  'People at a supplier or subtrade (owner, estimator, installer, foreman...). Exactly one parent. A project trade-line may point at one via job_trades.person_id.';

create index if not exists partner_people_supplier_idx on public.partner_people (supplier_id);
create index if not exists partner_people_subtrade_idx on public.partner_people (subtrade_id);

drop trigger if exists partner_people_set_updated_at on public.partner_people;
create trigger partner_people_set_updated_at
  before update on public.partner_people
  for each row execute function public.set_updated_at();

-- ─── job_trades — the specific person on this trade-line ─────────────────

alter table public.job_trades
  add column if not exists person_id uuid references public.partner_people(id) on delete set null;

comment on column public.job_trades.person_id is
  'The specific person (partner_people) assigned to this trade-line, if known. Null = company-level / TBD.';

-- ─── RLS — authenticated-only ───────────────────────────────────────────

alter table public.partner_people enable row level security;

drop policy if exists "partner_people_authenticated_all" on public.partner_people;
create policy "partner_people_authenticated_all"
  on public.partner_people for all to authenticated using (true) with check (true);
drop policy if exists "partner_people_anon_none" on public.partner_people;
create policy "partner_people_anon_none"
  on public.partner_people for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
