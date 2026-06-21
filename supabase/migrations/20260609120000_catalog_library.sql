-- Catalog → the shop's one library. Collapses the two typed tables
-- (catalog_materials + catalog_finishes) into a single flexible
-- catalog_items table keyed by `kind`, so the same source can hold
-- materials, hardware, doors, finishes, inserts, and labour/service
-- definitions — each with optional matrix pricing, an online link, and
-- kind-specific metadata. Estimator and Reface Studio read from this.
--
-- Also lands two companions that the orphaned (never-applied) "catalog
-- v2" migration intended but never delivered:
--   • catalog_price_history — append-only price log (was localStorage)
--   • catalog_cabinet_types — per-type assembly/install/loading minutes
--     the estimator auto-derives labour from. Hourly $/rates stay in
--     workspace_settings; this table holds only the minute defaults.
--
-- The old catalog_materials / catalog_finishes tables are empty (0 rows
-- live) so they are dropped after the new table is created — no backfill
-- needed. inventory_items.material_id is a *soft* ref (no FK) and is
-- unaffected by the drop; existing app ids (e.g. "m-bb18") are preserved
-- by the seed in catalogStore.tsx.

-- ─── set_updated_at (idempotent; already exists from earlier migration) ──

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── catalog_items — the unified library ────────────────────────────────

create table if not exists public.catalog_items (
  id text primary key,
  kind text not null default 'material'
    check (kind in ('material','hardware','door','finish','insert','labour','service')),
  name text not null default '',
  supplier text not null default '',
  link text,
  -- One of the 10 estimator sections when the item belongs to one;
  -- null for kinds that aren't section-bound (e.g. loose hardware).
  section text
    check (
      section is null or section in (
        'prework','casework','cnc','doors','face','finishing',
        'assembly','delivery','install','deficiencies'
      )
    ),
  unit text not null default 'ea' check (unit in ('ea','sqft','lf','bf','hr')),
  -- Simple/base price. Items with multi-dimensional pricing (e.g. reface
  -- door grids of species × style) carry the grid in `pricing` and may
  -- leave unit_price as a representative/from price.
  unit_price numeric not null default 0,
  pricing jsonb,                               -- matrix / tiered pricing; null = simple
  attributes jsonb not null default '{}'::jsonb, -- kind-specific metadata (finish coats, door style, …)
  default_waste_pct numeric not null default 0,
  default_markup_pct numeric not null default 35,
  active boolean not null default true,        -- soft-delete: keep refs from dangling
  price_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_items is
  'The shop''s one library: materials, hardware, doors, finishes, inserts, labour/service. Pricing + links + metadata referenced by Estimator and Reface.';

create index if not exists catalog_items_kind_idx on public.catalog_items (kind);
create index if not exists catalog_items_section_idx on public.catalog_items (section);
create index if not exists catalog_items_active_idx on public.catalog_items (active);

drop trigger if exists catalog_items_set_updated_at on public.catalog_items;
create trigger catalog_items_set_updated_at
  before update on public.catalog_items
  for each row execute function public.set_updated_at();

-- ─── catalog_price_history — append-only price log ──────────────────────

create table if not exists public.catalog_price_history (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.catalog_items(id) on delete cascade,
  supplier text not null default '',
  unit_price numeric not null,
  recorded_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','estimate','import')),
  job_id uuid
);

comment on table public.catalog_price_history is
  'Append-only: every observed price for a catalog item (manual edits, estimates, imports). Powers the stale chip + vs-90-day-avg indicator.';

create index if not exists catalog_price_history_item_recorded_idx
  on public.catalog_price_history (item_id, recorded_at desc);

-- ─── catalog_cabinet_types — per-type labour minute defaults ────────────

create table if not exists public.catalog_cabinet_types (
  id text primary key check (id in ('base','wall','tall','island')),
  label text not null,
  assembly_minutes numeric not null default 60,
  install_minutes numeric not null default 30,
  loading_minutes numeric not null default 5,
  updated_at timestamptz not null default now()
);

comment on table public.catalog_cabinet_types is
  'Per-cabinet-type minute defaults the estimator auto-derives Assembly/Install/Delivery-loading labour from. Hourly rates live in workspace_settings.';

insert into public.catalog_cabinet_types (id, label, assembly_minutes, install_minutes, loading_minutes)
values
  ('base',   'Base',          60, 30, 5),
  ('wall',   'Wall',          45, 20, 4),
  ('tall',   'Tall / pantry', 90, 45, 7),
  ('island', 'Island',        90, 45, 7)
on conflict (id) do nothing;

drop trigger if exists catalog_cabinet_types_set_updated_at on public.catalog_cabinet_types;
create trigger catalog_cabinet_types_set_updated_at
  before update on public.catalog_cabinet_types
  for each row execute function public.set_updated_at();

-- ─── RLS — authenticated-only, matching the live catalog pattern ────────

alter table public.catalog_items enable row level security;
alter table public.catalog_price_history enable row level security;
alter table public.catalog_cabinet_types enable row level security;

drop policy if exists "catalog_items_authenticated_all" on public.catalog_items;
create policy "catalog_items_authenticated_all"
  on public.catalog_items for all to authenticated using (true) with check (true);
drop policy if exists "catalog_items_anon_none" on public.catalog_items;
create policy "catalog_items_anon_none"
  on public.catalog_items for all to anon using (false) with check (false);

-- Price history is append-only: select + insert for authenticated, no
-- update/delete policy → those are denied by RLS default.
drop policy if exists "catalog_price_history_authenticated_read" on public.catalog_price_history;
create policy "catalog_price_history_authenticated_read"
  on public.catalog_price_history for select to authenticated using (true);
drop policy if exists "catalog_price_history_authenticated_insert" on public.catalog_price_history;
create policy "catalog_price_history_authenticated_insert"
  on public.catalog_price_history for insert to authenticated with check (true);
drop policy if exists "catalog_price_history_anon_none" on public.catalog_price_history;
create policy "catalog_price_history_anon_none"
  on public.catalog_price_history for all to anon using (false) with check (false);

drop policy if exists "catalog_cabinet_types_authenticated_all" on public.catalog_cabinet_types;
create policy "catalog_cabinet_types_authenticated_all"
  on public.catalog_cabinet_types for all to authenticated using (true) with check (true);
drop policy if exists "catalog_cabinet_types_anon_none" on public.catalog_cabinet_types;
create policy "catalog_cabinet_types_anon_none"
  on public.catalog_cabinet_types for all to anon using (false) with check (false);

-- ─── Retire the old typed tables (empty — 0 rows live) ──────────────────

drop table if exists public.catalog_materials cascade;
drop table if exists public.catalog_finishes cascade;

-- Reload PostgREST schema cache so the new tables are usable immediately.
notify pgrst, 'reload schema';
