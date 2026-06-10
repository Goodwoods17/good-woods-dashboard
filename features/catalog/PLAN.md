# Catalog — implementation plan

Goal: the Catalog is **the** library every other feature reads from for
materials, pricing, and metadata. Pricing must not live anywhere else
(today it's also hardcoded in `reface/lib/newSurreyPriceBook.ts` and
`estimator/lib/types.ts` — Phase 2/3 pull those in).

## Phase 1 — Foundation & migration reconciliation ✅ (2026-06-09)

- [x] Reconcile migrations. The never-applied `20260524_catalog_v2.sql`
      (`gw_*` tables) was the loser → archived to
      `supabase/migrations-archive/`. Its good ideas (price history,
      cabinet-type minutes) folded into the live schema.
- [x] `20260609120000_catalog_library.sql`: unified **`catalog_items`**
      (kind discriminator + `pricing`/`attributes` jsonb + `link` +
      `active` soft-delete), **`catalog_price_history`** (append-only),
      **`catalog_cabinet_types`** (per-type minutes, 4 rows). Dropped the
      empty `catalog_materials` / `catalog_finishes`. RLS
      authenticated-only. **Applied to live DB.**
- [x] `catalogStore.tsx` → unified `CatalogItem` model; `Material` /
      `Finish` kept as derived back-compat views so Estimator / Inventory
      didn't change. Soft-delete via `active`. localStorage v2→v3
      migration.
- [x] `priceHistory.ts` mirrors writes to `catalog_price_history`
      (localStorage mirror retained for the sync read helpers).
- [x] Structural placeholder seed across every kind (incl. a sample
      matrix-priced door + a service line).
- [x] Docs: CLAUDE.md rewritten, this PLAN added.

**Not done in Phase 1 (deliberately):** the UI still shows only the
Materials + Finishes tabs; hardware/insert/labour/service kinds persist
but aren't surfaced yet. Real prices/links are unfilled.

## Phase 1.6 — Multi-supplier offers ✅ (2026-06-09)

- [x] `20260610000000_catalog_multi_supplier.sql`: **`catalog_suppliers`** +
      **`catalog_offers`** child tables; `catalog_price_history.offer_id`;
      dropped `catalog_items.supplier` (kept `unit_price` as fallback);
      `set_preferred_offer` RPC + partial unique index (one preferred per
      item). RLS authenticated-only. **Applied + behaviour-verified on the
      live DB** (partial-unique rejects a 2nd preferred; cheapest-active
      query; atomic RPC swap).
- [x] `catalogRowMap.ts` — supplier/offer mappers + `assembleCatalog` +
      `pickSurfacedOffer` (preferred ?? cheapest active). `catalogStore`
      holds items+suppliers+offers, 3-way load with seed backfill, surfaced
      projections; `Material`/`Finish` now read the surfaced offer.
- [x] `priceHistory.ts` — per-offer logging + `getPriceDelta` +
      batched async `fetchDeltas([offerIds])` (one query, no N+1).
- [x] UI — `MaterialsTable` all-at-once supplier strip (cheapest-first,
      ← best / ★ preferred, ↑/↓ market delta) + expandable `OffersSubRow`
      editor; `cells.DeltaChip`/`BestBadge`/`PreferredBadge`.
- [x] Inert `offerIdSnapshot` seam on the estimator `LineItem` (future
      cart-loader groups a job's lines by supplier).
- [x] ADR `0006-catalog-items-vs-offers.md` + glossary `CONTEXT.md`.
- **Decision:** see `docs/decisions/0006`. Offers only for procured kinds;
  finish/labour/service stay inline-priced; finish-as-recipe + labour are
  separate future work.

## Phase 1.5 — Real data

- [ ] Replace placeholder seed with Andrew's actual material / hardware /
      door / insert lists, supplier links, and real prices.
- [ ] Load the New Surrey door book as `door`-kind items with their grids
      in `pricing` (prereq for Phase 2 Reface wiring).

## Phase 2 — Consumer wiring (make it THE source)

- [ ] **Estimator pick-from-catalog.** `LineItem` already carries
      `catalogId` + price/supplier snapshot fields. Add a picker to
      `LineItemRow`; "save line to Catalog" for the reverse.
- [ ] **Reface reads the library.** Teach `reface/lib/pricing.ts` to read
      door/finish pricing from `catalog_items.pricing` instead of the
      hardcoded `newSurreyPriceBook.ts`; retire the hardcoded book.
- [ ] **Cabinet-type minutes from Catalog.** Estimator reads
      `catalog_cabinet_types` instead of `DEFAULT_*_MINUTES` in
      `estimator/lib/types.ts`; add a small editor (Labour/Service tab).
- [ ] **Surface all kinds in the UI.** Move tab nav to the canonical
      segmented pill; add Hardware / Inserts / Labour & Services views (or
      a single filterable table). Add `link` + `kind` columns.
- [ ] **Async price-history reads.** Surface "↑ $X vs 90-day avg" and
      "last bid $Y on Job #N" from `catalog_price_history`.

## Phase 3 — Mozaik CSV import

- [ ] Drop a Mozaik CSV → match/create catalog items → seed estimator
      lines with per-material quantities (the per-job BOM). Prereq for
      Inventory's stock-vs-needs view.

## Design debt (track with the redesign pass)

Per `docs/DESIGN.md`: the Materials/Finishes tables use bordered slabs
instead of shadow-floated white; an undefined `status-success` token; the
tab nav predates the canonical `ViewToggle` pill; grid cells strip the
focus ring. Fold into the Phase-2 UI work or a dedicated polish pass.
