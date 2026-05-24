-- Catalog v2 — restructured material schema, price history log, cabinet
-- type defaults, and estimate templates. Replaces the localStorage-only
-- catalog with a Supabase-backed source of truth so price history
-- accumulates over time and the same materials are usable from any device.
--
-- Apply when the Good Woods Supabase project is un-paused. The client-side
-- catalogStore.tsx already speaks the v2 schema in localStorage; the
-- localStorage-to-Supabase upsert path is wired in but no-ops until these
-- tables exist.

-- ─── Catalog of materials ───────────────────────────────────────────────

create table if not exists public.gw_catalog (
  id text primary key,
  name text not null,
  supplier text not null default '',
  unit text not null check (unit in ('ea','sqft','lf','bf','hr')),
  unit_price numeric(12,4) not null default 0,
  section text not null check (
    section in (
      'prework','casework','cnc','doors','face','finishing',
      'assembly','delivery','install','deficiencies'
    )
  ),
  default_waste_pct numeric(6,2) default 0,
  default_markup_pct numeric(6,2) default 35,
  price_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gw_catalog_section_idx on public.gw_catalog (section);
create index if not exists gw_catalog_updated_idx on public.gw_catalog (price_updated_at desc);

-- ─── Per-cabinet-type minute defaults ───────────────────────────────────
-- One row per cabinet type. Editable in the Catalog UI; consumed by the
-- estimator's auto-derive logic for Assembly + Install + Delivery loading.

create table if not exists public.gw_cabinet_types (
  id text primary key check (id in ('base','wall','tall','island')),
  label text not null,
  assembly_minutes numeric(6,2) not null default 60,
  install_minutes numeric(6,2) not null default 30,
  loading_minutes numeric(6,2) not null default 5,
  updated_at timestamptz not null default now()
);

insert into public.gw_cabinet_types (id, label, assembly_minutes, install_minutes, loading_minutes)
values
  ('base',   'Base',          60, 30, 5),
  ('wall',   'Wall',          45, 20, 4),
  ('tall',   'Tall / pantry', 90, 45, 7),
  ('island', 'Island',        90, 45, 7)
on conflict (id) do nothing;

-- ─── Price history (append-only log) ────────────────────────────────────
-- Every price observation: manual catalog edits, every estimate that
-- pulled a catalog item, and (later) CSV/Mozaik imports. Powers the
-- "↑ $X vs 90-day avg" indicator and the "last bid: $Y on Job #N"
-- tooltip in the LineItemRow.

create table if not exists public.gw_price_history (
  id uuid primary key default gen_random_uuid(),
  material_id text not null references public.gw_catalog(id) on delete cascade,
  supplier text not null,
  unit_price numeric(12,4) not null,
  recorded_at timestamptz not null default now(),
  source text not null check (source in ('manual','estimate','import')),
  job_id uuid
);

create index if not exists gw_price_history_material_recorded_idx
  on public.gw_price_history (material_id, recorded_at desc);

-- ─── Estimate templates ─────────────────────────────────────────────────
-- Job-type templates that control which estimator sections are visible
-- and seed defaults. Five built-ins plus user-saved customs.

create table if not exists public.gw_estimate_templates (
  id text primary key,
  name text not null,
  description text,
  active_sections text[] not null,
  default_overhead_pct numeric(6,2),
  default_markup_pct numeric(6,2),
  is_built_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.gw_estimate_templates
  (id, name, description, active_sections, is_built_in)
values
  (
    'tpl_full_build',
    'Full custom build',
    'Every section — pre-work through deficiencies. The default.',
    array['prework','casework','cnc','doors','face','finishing','assembly','delivery','install','deficiencies'],
    true
  ),
  (
    'tpl_reface',
    'Refacing',
    'Replace doors + visible faces. No new casework or assembly.',
    array['prework','doors','face','finishing','delivery','install','deficiencies'],
    true
  ),
  (
    'tpl_install_only',
    'Install only',
    'Sub-out install service. Delivery + install + touch-ups.',
    array['prework','delivery','install','deficiencies'],
    true
  ),
  (
    'tpl_design_only',
    'Design / measure only',
    'Site visit + design meetings. No build.',
    array['prework'],
    true
  ),
  (
    'tpl_sub_finishing',
    'Sub finishing',
    'Finishing-only sub-out. Spray work for another shop.',
    array['prework','finishing','delivery'],
    true
  )
on conflict (id) do nothing;

-- ─── RLS ────────────────────────────────────────────────────────────────
-- Single-user model (consistent with gw_jobs): anon can read + write.
-- Tighten when multi-user lands.

alter table public.gw_catalog enable row level security;
alter table public.gw_cabinet_types enable row level security;
alter table public.gw_price_history enable row level security;
alter table public.gw_estimate_templates enable row level security;

create policy "anon read catalog" on public.gw_catalog for select to anon using (true);
create policy "anon write catalog" on public.gw_catalog for insert to anon with check (true);
create policy "anon update catalog" on public.gw_catalog for update to anon using (true) with check (true);
create policy "anon delete catalog" on public.gw_catalog for delete to anon using (true);

create policy "anon read cabinet_types" on public.gw_cabinet_types for select to anon using (true);
create policy "anon update cabinet_types" on public.gw_cabinet_types for update to anon using (true) with check (true);

create policy "anon read price_history" on public.gw_price_history for select to anon using (true);
create policy "anon write price_history" on public.gw_price_history for insert to anon with check (true);
-- Price history is append-only — no update/delete policies for anon.

create policy "anon read templates" on public.gw_estimate_templates for select to anon using (true);
create policy "anon write templates" on public.gw_estimate_templates for insert to anon with check (true);
create policy "anon update templates" on public.gw_estimate_templates for update to anon using (true) with check (
  is_built_in = false -- protect built-ins from accidental overwrite
);
create policy "anon delete templates" on public.gw_estimate_templates for delete to anon using (
  is_built_in = false
);

-- ─── Updated-at triggers ────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists gw_catalog_updated_at on public.gw_catalog;
create trigger gw_catalog_updated_at before update on public.gw_catalog
  for each row execute function public.set_updated_at();

drop trigger if exists gw_cabinet_types_updated_at on public.gw_cabinet_types;
create trigger gw_cabinet_types_updated_at before update on public.gw_cabinet_types
  for each row execute function public.set_updated_at();

drop trigger if exists gw_templates_updated_at on public.gw_estimate_templates;
create trigger gw_templates_updated_at before update on public.gw_estimate_templates
  for each row execute function public.set_updated_at();

-- Reload PostgREST schema cache so the new tables are usable immediately.
notify pgrst, 'reload schema';
