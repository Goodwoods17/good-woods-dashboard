-- Catalog persistence: materials + finishes move from localStorage to Supabase.
-- Text primary keys preserve the existing app ids (e.g. "m-bb18") so Inventory
-- (inventory_items.material_id) and the Estimator keep their references.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.catalog_materials (
  id text primary key,
  name text not null default '',
  supplier text not null default '',
  unit text not null default 'ea',
  unit_price numeric not null default 0,
  section text not null default 'casework',
  default_waste_pct numeric not null default 0,
  default_markup_pct numeric not null default 35,
  price_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_materials is
  'Price book: materials. Text PK preserves app ids referenced by inventory + estimator';

create table if not exists public.catalog_finishes (
  id text primary key,
  name text not null default '',
  coats integer not null default 2,
  unit_price numeric not null default 0,
  price_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_finishes is 'Price book: finishes (legacy table)';

drop trigger if exists catalog_materials_set_updated_at on public.catalog_materials;
create trigger catalog_materials_set_updated_at
  before update on public.catalog_materials
  for each row execute function public.set_updated_at();

drop trigger if exists catalog_finishes_set_updated_at on public.catalog_finishes;
create trigger catalog_finishes_set_updated_at
  before update on public.catalog_finishes
  for each row execute function public.set_updated_at();

alter table public.catalog_materials enable row level security;
alter table public.catalog_finishes enable row level security;

drop policy if exists "catalog_materials_authenticated_all" on public.catalog_materials;
create policy "catalog_materials_authenticated_all"
  on public.catalog_materials for all to authenticated using (true) with check (true);
drop policy if exists "catalog_materials_anon_none" on public.catalog_materials;
create policy "catalog_materials_anon_none"
  on public.catalog_materials for all to anon using (false) with check (false);

drop policy if exists "catalog_finishes_authenticated_all" on public.catalog_finishes;
create policy "catalog_finishes_authenticated_all"
  on public.catalog_finishes for all to authenticated using (true) with check (true);
drop policy if exists "catalog_finishes_anon_none" on public.catalog_finishes;
create policy "catalog_finishes_anon_none"
  on public.catalog_finishes for all to anon using (false) with check (false);
