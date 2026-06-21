-- Catalog Phase 2 → multi-supplier offers.
--
-- Separates Items ("what we buy") from Offers ("who sells it, at what price,
-- where"), drawn from a lightweight Suppliers list. One procured item can have
-- many offers; the surfaced price = preferred offer ?? cheapest active offer ??
-- the item's own unit_price. See docs/decisions/0006-catalog-items-vs-offers.md
-- and features/catalog/CONTEXT.md.
--
-- Additive over the live 20260609120000_catalog_library schema. Offers apply
-- only to procured kinds (material/hardware/door/insert); finish/labour/service
-- keep their inline unit_price and have no offers. Offers inherit the item's
-- unit (no per-offer unit column) so "cheapest" is a valid numeric comparison.

-- ─── catalog_suppliers — the vendors we buy from ────────────────────────

create table if not exists public.catalog_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  website text,
  -- Reserved for a future cart-loading agent (per-supplier cart recipe /
  -- login flag). Inert today.
  cart_config jsonb not null default '{}'::jsonb,
  -- Optional link to a CRM contact; a supplier is NOT a contact, so this is a
  -- loose association that nulls out if the contact is deleted.
  contact_id uuid references public.contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_suppliers is
  'Vendors the shop buys from (Reimer, PJ White, Sherwin-Williams, New Surrey…). Referenced by catalog_offers. Distinct from CRM contacts; contact_id is an optional link.';

-- Plain lookup index for app-side find-or-create (NOT a unique expression
-- index: PostgREST upsert can't target lower(name); dedupe is app-side ilike).
create index if not exists catalog_suppliers_name_idx on public.catalog_suppliers (name);

drop trigger if exists catalog_suppliers_set_updated_at on public.catalog_suppliers;
create trigger catalog_suppliers_set_updated_at
  before update on public.catalog_suppliers
  for each row execute function public.set_updated_at();

-- ─── catalog_offers — a supplier's price for a procured item ────────────

create table if not exists public.catalog_offers (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.catalog_items(id) on delete cascade,
  supplier_id uuid not null references public.catalog_suppliers(id) on delete restrict,
  -- Priced in the ITEM's unit (no per-offer unit) so cheapest is comparable.
  unit_price numeric not null default 0,
  product_url text,   -- supplier buy page (cart-loader navigate target)
  sku text,           -- supplier line identity (cart-loader line key)
  is_preferred boolean not null default false,
  cart_meta jsonb not null default '{}'::jsonb,  -- reserved: per-offer option/qty hints
  active boolean not null default true,          -- soft-delete
  price_updated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_offers is
  'One supplier''s price + buy URL for one procured catalog item. Many offers per item. Surfaced price = preferred ?? cheapest active ?? item.unit_price.';

create index if not exists catalog_offers_item_idx on public.catalog_offers (item_id);
create index if not exists catalog_offers_supplier_idx on public.catalog_offers (supplier_id);
-- Cheapest-active lookup.
create index if not exists catalog_offers_cheapest_idx
  on public.catalog_offers (item_id, active, unit_price);
-- DB-enforced one preferred offer per item.
create unique index if not exists catalog_offers_one_preferred_idx
  on public.catalog_offers (item_id) where is_preferred;

drop trigger if exists catalog_offers_set_updated_at on public.catalog_offers;
create trigger catalog_offers_set_updated_at
  before update on public.catalog_offers
  for each row execute function public.set_updated_at();

-- ─── set_preferred_offer — atomic pin/unpin ─────────────────────────────
-- The partial unique index above throws if two rows are briefly preferred, so
-- clear-then-set must run in one call. Pass p_offer = null to unpin entirely.

create or replace function public.set_preferred_offer(p_item text, p_offer uuid)
returns void language plpgsql as $$
begin
  update public.catalog_offers
     set is_preferred = false
   where item_id = p_item
     and is_preferred = true
     and (p_offer is null or id <> p_offer);
  if p_offer is not null then
    update public.catalog_offers
       set is_preferred = true
     where id = p_offer and item_id = p_item;
  end if;
end;
$$;

grant execute on function public.set_preferred_offer(text, uuid) to authenticated;

-- ─── catalog_price_history — key rows to the offer they came from ───────
-- Keep item_id + the supplier text snapshot so history survives offer/supplier
-- deletion; offer_id is the precise key for per-supplier deltas.

alter table public.catalog_price_history
  add column if not exists offer_id uuid references public.catalog_offers(id) on delete set null;

create index if not exists catalog_price_history_offer_recorded_idx
  on public.catalog_price_history (offer_id, recorded_at desc);

-- ─── catalog_items — drop the now-derived inline supplier ───────────────
-- Keep unit_price as the universal fallback (offer-less / in-house items).
-- supplier is superseded by offers; the surfaced offer carries the supplier.

alter table public.catalog_items drop column if exists supplier;

-- ─── RLS — authenticated-only, matching the catalog pattern ─────────────

alter table public.catalog_suppliers enable row level security;
alter table public.catalog_offers enable row level security;

drop policy if exists "catalog_suppliers_authenticated_all" on public.catalog_suppliers;
create policy "catalog_suppliers_authenticated_all"
  on public.catalog_suppliers for all to authenticated using (true) with check (true);
drop policy if exists "catalog_suppliers_anon_none" on public.catalog_suppliers;
create policy "catalog_suppliers_anon_none"
  on public.catalog_suppliers for all to anon using (false) with check (false);

drop policy if exists "catalog_offers_authenticated_all" on public.catalog_offers;
create policy "catalog_offers_authenticated_all"
  on public.catalog_offers for all to authenticated using (true) with check (true);
drop policy if exists "catalog_offers_anon_none" on public.catalog_offers;
create policy "catalog_offers_anon_none"
  on public.catalog_offers for all to anon using (false) with check (false);

-- Reload PostgREST schema cache so the new tables/columns are usable immediately.
notify pgrst, 'reload schema';
