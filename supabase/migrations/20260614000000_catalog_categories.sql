-- Catalog categories: the user-defined two-level taxonomy that organizes the
-- price book by what things ARE (Hardware -> Hinges/Slides), independent of the
-- estimator `section` (which stays a per-item tag for quoting).
--
-- `kind` stays on catalog_items as the pricing-behaviour flag (procured kinds
-- carry supplier offers; in-house kinds are single-price) but is no longer the
-- user-facing organizing axis — it seeds the initial categories below.

create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- parent_id null = top-level category; set = sub-category under that category.
  parent_id uuid references public.catalog_categories(id) on delete cascade,
  -- Default kind for new items filed here -- drives pricing behaviour.
  default_kind text not null default 'material'
    check (default_kind in ('material','hardware','door','finish','insert','labour','service')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_categories_parent_idx on public.catalog_categories(parent_id);

-- RLS: authenticated-only, mirroring catalog_items / catalog_offers.
alter table public.catalog_categories enable row level security;

create policy catalog_categories_anon_none on public.catalog_categories
  as permissive for all to anon using (false) with check (false);
create policy catalog_categories_authenticated_all on public.catalog_categories
  as permissive for all to authenticated using (true) with check (true);

-- Item -> category / sub-category. Nullable; on delete set null keeps the item.
alter table public.catalog_items
  add column if not exists category_id uuid references public.catalog_categories(id) on delete set null;
alter table public.catalog_items
  add column if not exists subcategory_id uuid references public.catalog_categories(id) on delete set null;

create index if not exists catalog_items_category_idx on public.catalog_items(category_id);
create index if not exists catalog_items_subcategory_idx on public.catalog_items(subcategory_id);

-- Seed top-level categories from the kinds currently in use and file each item
-- under its kind's category. Sub-categories are added in the UI later. Idempotent:
-- only touches items that have no category yet, find-or-creates by name.
do $$
declare r record; cat_id uuid;
begin
  for r in
    select kind,
      case kind
        when 'material' then 'Materials' when 'hardware' then 'Hardware'
        when 'door' then 'Doors' when 'finish' then 'Finishes'
        when 'insert' then 'Inserts' when 'labour' then 'Labour'
        when 'service' then 'Services' else initcap(kind) end as label,
      case kind
        when 'material' then 1 when 'hardware' then 2 when 'door' then 3
        when 'finish' then 4 when 'insert' then 5 when 'service' then 6
        when 'labour' then 7 else 8 end as ord
    from public.catalog_items where category_id is null group by kind
  loop
    select id into cat_id from public.catalog_categories
      where parent_id is null and name = r.label limit 1;
    if cat_id is null then
      insert into public.catalog_categories (name, default_kind, sort_order)
        values (r.label, r.kind, r.ord) returning id into cat_id;
    end if;
    update public.catalog_items set category_id = cat_id
      where kind = r.kind and category_id is null;
  end loop;
end $$;
