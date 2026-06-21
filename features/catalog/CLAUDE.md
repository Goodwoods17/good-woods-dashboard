# Catalog

The shop's **one library** — the single source of truth for materials,
hardware, doors, finishes, inserts, and labour/service definitions, with
their pricing, supplier links, and metadata. The Estimator and Reface
Studio read from here when building a quote; Inventory tracks stock
against it. If another feature needs to reference a material or a price,
it comes from the Catalog.

> **Spec status:** reconciled 2026-06-09 to the unified `catalog_items`
> model (migration `20260609120000_catalog_library.sql`). Read before
> touching; update in the same commit if behaviour changes.

## The model — one table, one type

Everything the shop prices off is a **`CatalogItem`** distinguished by
`kind`:

| kind       | what it is                                      |
| ---------- | ----------------------------------------------- |
| `material` | sheet goods, lumber, sprays — the bulk          |
| `hardware` | hinges, slides, pulls, fasteners                |
| `door`     | door / drawer fronts (may carry matrix pricing) |
| `finish`   | spray finishes, priced by sqft                  |
| `insert`   | drawer organisers, cutlery trays, pull-outs     |
| `labour`   | labour line definitions                         |
| `service`  | flat-rate services (delivery, sub-out)          |

**Multi-supplier (Phase 1.6).** Procured kinds (`material`, `hardware`,
`door`, `insert`) carry many supplier **offers** in `catalog_offers`,
drawn from a `catalog_suppliers` list. The price a row shows — and that
the Estimator/Inventory read — is the **surfaced price**: the pinned
preferred offer if any, else the cheapest active offer, else the item's
own inline `unitPrice` (the fallback for in-house kinds and offer-less
items). The item's `supplier` column is gone — supplier now lives on the
offer. See `docs/decisions/0006-catalog-items-vs-offers.md` and the
glossary in `CONTEXT.md`. Offers inherit the item's `unit`, so "cheapest"
is a valid comparison; a different unit/size is a different item.

Beyond the flat columns (`name`, `link`, `section`, `unit`, `unitPrice`,
`defaultWastePct`, `defaultMarkupPct`, `notes`), two JSONB fields absorb
what varies by kind:

- **`pricing`** — multi-dimensional pricing. `null` for simple items; for
  a reface door it holds the species × style grid. Phase 2 folds the full
  New Surrey book in here so Reface reads the library instead of its
  hardcoded price book.
- **`attributes`** — kind-specific metadata (a finish's `coats`, a door's
  style, a hinge's overlay).

`active` is a **soft-delete** flag: removing an item flips it off so any
estimate or job that still references it can resolve its name + last
price, but it drops out of the book. Nothing is hard-deleted except via
`reset`.

## Persistence — Supabase-backed (not localStorage)

`catalogStore.tsx` reads/writes `public.catalog_items` whenever Supabase
is configured (`hasSupabase()`), falling back to localStorage
(`gw_catalog_v1`, schema v3, with a one-time migration from the older
`{ materials, finishes }` v2 blob) only when it isn't. An empty table is
seeded once from `SEED_ITEMS` so the book is never blank. Inline edits
debounce-flush per row (600 ms); price changes stamp `priceUpdatedAt` and
append to the price-history log.

Five live tables back the feature:

- **`catalog_items`** — the library (RLS: authenticated-only).
- **`catalog_suppliers`** — the vendors we buy from; optional `contact_id`
  link to a CRM contact, `cart_config` jsonb reserved for a future
  cart-loader. Created inline (find-or-create by name).
- **`catalog_offers`** — one supplier's price + buy URL/SKU for one
  procured item. Many per item. Partial unique index enforces one
  preferred per item; the `set_preferred_offer` RPC pins atomically.
- **`catalog_price_history`** — append-only log of every observed price,
  now keyed to the `offer_id` it came from (item-level/estimate rows
  leave it null). `priceHistory.ts` writes here + a localStorage mirror;
  `fetchDeltas([offerIds])` batches the per-supplier up/down deltas in one
  query (no N+1).
- **`catalog_cabinet_types`** — per-cabinet-type assembly/install/loading
  **minutes** the estimator auto-derives labour from. Hourly **$/rates**
  stay in `workspace_settings` — one home, no double source of truth.

## Where things live

```
features/catalog/
├── lib/
│   ├── catalogStore.tsx   CatalogItem/CatalogKind types, CatalogProvider,
│   │                      useCatalog, SEED_ITEMS/SUPPLIERS/OFFERS,
│   │                      supplier+offer API, Material/Finish back-compat
│   ├── catalogRowMap.ts   supplier/offer row⇄type mappers, pickSurfacedOffer,
│   │                      assembleCatalog (stitch offers onto items in memory)
│   └── priceHistory.ts    append-only price log + per-offer deltas (async batch)
└── components/
    ├── CatalogView.tsx     top-level view with tab nav (Materials | Finishes)
    ├── MaterialsTable.tsx  materials CRUD + all-at-once supplier offers strip
    ├── OffersSubRow.tsx    expanded per-item offers editor (price/url/sku/pin)
    ├── FinishesTable.tsx   finishes CRUD (in-house; no offers)
    ├── CrudTable.tsx       shared Th + CrudRow<T> primitives
    └── cells.tsx           AutoText, NumCell, StaleChip, DeltaChip, badges
```

`src/app/catalog/page.tsx` is a thin shell rendering `<CatalogView />`.
The provider is mounted in `src/app/layout.tsx` (inside `AuthProvider`).
Consumers: `/catalog` (CRUD), `/estimator` (reads — Phase 2 picking),
`/inventory` (reads materials for stock-on-hand), `/reface` (Phase 2).

## Back-compat surface

The unified model is internal. `useCatalog()` still exposes `materials`
and `finishes` (derived views — now over the **surfaced offer**, so
`Material.supplier`/`unitPrice` are read-only projections of the surfaced
offer) and the `addMaterial`/`updateMaterial`/`removeMaterial` /
`addFinish`/`updateFinish`/`removeFinish` ops, so Inventory's `ItemModal`
and `useMaterialsBySection` did not change. New code should prefer
`itemsWithOffers` (the `CatalogItemView` with offers + surfaced offer
stitched on) and the `addOffer`/`updateOffer`/`removeOffer` /
`setPreferredOffer` / `addSupplier` API.

`materials` = active items whose kind is material/hardware/door/insert
**and** that carry a section (so the section-grouped Materials tab keeps
working). `finishes` = active `finish`-kind items.

## Domain notes

- `unitPrice` is the primary cost field. For non-area items the same field
  holds the per-unit price; see `notes` / `unit` for the basis.
- Seed data is **structural placeholder** — it exercises every kind
  (incl. a sample matrix-priced door and a service line) to prove the
  model end to end. Real prices/links are Andrew's to fill in.

## When to revisit

- See `PLAN.md` for the phased roadmap (Phase 2 = consumer wiring:
  estimator pick-from-catalog, fold the New Surrey matrix into door items
  so Reface reads the library; surface hardware/insert/labour/service
  kinds in the UI; async price-history reads).
- If suppliers grow past ~20, the supplier text field probably wants to
  become its own table with its own page.
