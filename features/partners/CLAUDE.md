# Partners

Profiles for the parties Spacecraft works with that **aren't clients** —
**suppliers** (we buy goods from them) and **subtrades** (we hire them to do
work on a job) — plus the **trade coordination** that connects subtrades to
projects. Clients stay in `features/contacts` / `/crm`; this feature is the
"vendors" half of the relationship map.

> **Planned via `/grill-with-docs` 2026-06-20.** Canonical decisions live in
> `docs/decisions/0007-subtrades-partners-and-trade-lines.md` (extends ADR 0006).
> Glossary: `docs/domain.md` → "Parties we work with". Read both before touching.

## What it does

- **`/partners`** — a hub with two tabs: **Suppliers** and **Subtrades**. Each is
  a searchable list that links to a profile.
- **`/suppliers/[id]`** — supplier profile. Hero is **"What we buy here"**: the
  catalog offers this supplier prices, with the up/down price-delta chips. Plus
  contact block (rep, phone, email, address, account #), website, lead-time note.
- **`/subtrades/[id]`** — subtrade profile. Hero is **"Jobs worked"**: the
  trade-lines this subtrade is assigned to, each with the trade performed, date,
  status, and optional cost. Plus a **trade** pill (its primary discipline, color
  + icon) and the embedded contact block.
- **Trades card on `/jobs/[id]`** — sibling to the Parties card. Lists the
  project's **trade-lines** (color dot + icon + trade + assigned subtrade or
  "TBD"). An **Add trade** button adds a line; a **tap-to-add suggestion strip**
  offers the registry's default trades. Assign / reassign a subtrade per line.
- **Trade registry in `/settings`** — manage the discipline taxonomy: label,
  color, icon, "suggested by default", sort order, active.

## The model

Parties are separated by **what we pay them for** (per ADR 0006/0007):

| Party     | Paid for | Home table                      | Profile         |
| --------- | -------- | ------------------------------- | --------------- |
| Client    | the job  | `contacts` (CRM)                | `/crm/[id]`     |
| Supplier  | goods    | `catalog_suppliers` (enriched)  | `/suppliers/[id]`  |
| Subtrade  | labour   | `subtrades` (new)               | `/subtrades/[id]`  |

Tables (all RLS authenticated-only; Supabase when configured, `localStorage`
fallback mirroring catalog/contacts):

- **`subtrades`** (new) — `id`, `name`, `trade_id` (FK → `trades`, primary
  discipline), `contact_name`, `phone`, `email`, `address`, `typical_rate_note`
  (free text, **not** a money field), `notes`, `active` (soft-delete),
  `created_at`, `updated_at`.
- **`trades`** (new, the registry) — `id`, `key`, `label`, `color` (a token from
  the off-axis categorical palette), `icon`, `is_suggested_default` (bool),
  `sort_order`, `active`. Seeded with installer, finisher, countertop, electrical,
  plumbing, delivery, upholstery, other.
- **`job_trades`** (new, the trade-line join) — `id`, `job_id` (FK → `jobs`),
  `trade_id` (FK → `trades`, the authoritative *what was done here*),
  `subtrade_id` (FK → `subtrades`, **nullable** = needed-but-unassigned),
  `status` (`needed` | `booked` | `done`), `cost` (numeric, **nullable**,
  captured-not-rolled-up), `notes`, `created_at`, `updated_at`.
- **`catalog_suppliers`** (enriched, additive columns) — gains `contact_name`,
  `phone`, `address`, `account_number`, `lead_time_note`, `active`. Already has
  `name`, `website`, `notes`, `cart_config`, dormant `contact_id`.

## Where things live

```
features/partners/
├── CLAUDE.md
├── PLAN.md
├── lib/
│   ├── subtradesStore.tsx     SubtradesProvider, useSubtrades, CRUD
│   ├── tradesStore.tsx        TradesProvider, useTrades (registry), CRUD + reorder
│   ├── jobTradesStore.tsx     trade-line CRUD, assign/unassign subtrade, per-job query
│   ├── rowMaps.ts             Supabase row <-> type mappers
│   └── tradeColors.ts         palette token map + icon map (pending /impeccable)
└── components/
    ├── PartnersView.tsx       /partners hub + tab nav
    ├── SuppliersList.tsx      Suppliers tab
    ├── SubtradesList.tsx      Subtrades tab
    ├── SupplierDetail.tsx     /suppliers/[id]  (hero: catalog offers)
    ├── SubtradeDetail.tsx     /subtrades/[id]  (hero: jobs worked)
    ├── SubtradeForm.tsx       create/edit subtrade (inline mini-form, not Modal)
    ├── TradesCard.tsx         the Trades card for /jobs/[id]
    ├── TradeLineRow.tsx       one trade-line (dot+icon, trade, subtrade combobox)
    ├── TradeSuggestionStrip.tsx  tap-to-add default trades
    ├── TradePill.tsx          color dot + icon + label
    └── TradeRegistryEditor.tsx   the /settings panel
```

Route pages stay thin: `src/app/partners/page.tsx`, `src/app/suppliers/[id]/page.tsx`,
`src/app/subtrades/[id]/page.tsx` each render the matching view. Providers mount
in `src/app/layout.tsx` inside `AuthProvider`, beside the catalog/contacts ones.

## Design contracts

- **Trade colors are a dedicated categorical palette** — **defined and verified**
  (`/impeccable` pass 2026-06-20) in `DESIGN.md` → §2 "Categorical (Trade)
  Palette" + the "Off-Axis Categorical Rule". A cool-arc (hue 200–351), muted,
  off every semantic axis; rendered as an 8px dot + Lucide icon on a neutral pill,
  never fills, always with a label. Consume the `--trade-*` tokens; never hardcode
  a hue. Icon carries identity, colour carries the glance.
- **"+ Add subtrade" / "+ Create"** from a combobox is an inline expanding
  mini-form, not a Modal (matches the contacts contract). Modal reserved for
  delete-confirm.
- **Suggested trades never auto-write.** They appear as a tap-to-add strip; a
  trade-line exists only after the user taps.
- **No em dashes in UI copy** (shared `/impeccable` ban).
- **Money is invisible in v1.** No spend/paid totals anywhere; `cost` is an
  optional per-line input only.
- **Soft-delete** via `active`, matching catalog. Archived rows resolve names for
  historical trade-lines but drop out of lists.

## When to revisit

- **Spend / amount-paid rollups** — sum `job_trades.cost` per subtrade, supplier
  spend from orders. Needs the P&L tie-in; the `cost` column is the seam.
- **Purchase orders / cart loading** — `catalog_suppliers.cart_config` +
  `offerIdSnapshot` are the existing seams (ADR 0006). Out of scope here.
- **Surface subtrades on `/installer`** alongside in-house crew once `installerId`
  (Users) lands — "who's on site" then spans both.
- **Multiple contacts per vendor** — promote the embedded fields to a linked
  `contacts` person via the dormant `contact_id`. Only when the list demands it.
- **Communication history** per party — real CRM territory; its own feature.

## What this feature does NOT own

- **Client profiles** → `features/contacts` (`/crm`).
- **Catalog items / offers / pricing** → `features/catalog`. This feature only
  *reads* offers for the supplier hero and *adds* the supplier-profile columns.
- **The `/jobs/[id]` page shell** → `features/jobs`; this feature contributes the
  Trades card into it.
- **Cross-feature primitives** (`Pill`, `Modal`, `StatusDot`, `Combobox`,
  `PageHeader`) → `shared/components/`.
- **In-house crew / installers / Users** → auth + jobs `installerId` path.
