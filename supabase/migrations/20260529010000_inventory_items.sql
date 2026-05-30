-- Inventory: stock-on-hand register. Retires the localStorage "gw_inventory_v1".
-- material_id is an app-level reference to a catalog material id (text, no hard
-- FK, since the catalog still lives client-side). Name/unit/value are snapshotted
-- so an inventory row stays self-describing even if the catalog entry changes.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  material_id text,
  material_name text not null,
  on_hand numeric not null default 0,
  reorder_at numeric not null default 0,
  unit text not null default 'units',
  unit_value numeric not null default 0,
  reordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_items is
  'Stock-on-hand register; material_id is a soft ref to a catalog material';

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

alter table public.inventory_items enable row level security;

create policy "inventory_items_authenticated_all"
  on public.inventory_items for all
  to authenticated using (true) with check (true);

create policy "inventory_items_anon_none"
  on public.inventory_items for all
  to anon using (false) with check (false);
