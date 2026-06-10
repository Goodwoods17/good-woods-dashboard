# 0006. Catalog separates Items from Offers; price is derived; labour is excluded

Date: 2026-06-09

## Status

**Accepted.** Refines the Phase 1 unified-catalog model (migration
`20260609120000_catalog_library.sql`) ahead of the Phase 2 multi-supplier build.

## Context

The Catalog (Phase 1) models one price + one supplier + one link **inline** on
each `catalog_items` row. But the same material is routinely bought from several
suppliers at different prices — 3/4" walnut veneer MDF core is $145/sheet from
Reimer vs $165/sheet from PJ White — and those prices move with global hardwood
and sheet-goods markets. Andrew loads new numbers as they come in and needs to:

- hold many suppliers per material, each with its own price and buy URL;
- see, per supplier, whether a price went **up or down** since last time;
- compare **all suppliers for one material at once** and pick one for a quote,
  without flipping between supplier screens or memorising prices;
- pin a **preferred** supplier that wins even when it isn't cheapest.

Two questions fell out of designing this: (1) does _every_ `kind` have suppliers,
and (2) does labour belong in a price book at all?

The tables are effectively empty (0 live rows), so the model can be revised now
at zero migration cost.

## Decision

**Separate _Items_ ("what we buy") from _Offers_ ("who sells it, at what price,
where"), drawn from a lightweight _Suppliers_ list — but only for procured kinds.**

1. **Offers apply only to procured kinds** — `material`, `hardware`, `door`,
   `insert`. New `catalog_suppliers` and `catalog_offers` child tables; one item
   has many offers. In-house kinds (`finish`, `labour`, `service`) carry **no
   offers**.
2. **`catalog_items.unit_price` is kept, `supplier` is dropped.** Price is
   derived — **surfaced price = preferred offer ?? cheapest active offer ??
   inline `unit_price`** — so an item is never priceless (a freshly-added
   procured item with no offers yet, or an in-house item, falls back to its
   inline price). Keeping `unit_price` is _not_ a dual source of truth: offers
   always win when present.
3. **Offers inherit the item's unit** (no per-offer unit). A genuinely different
   unit or sheet size is a _different_ Catalog Item. This keeps the "cheapest"
   comparison a valid numeric `min()` and the "← best" badge trustworthy.
4. **A `finish` is a recipe of procured materials** (e.g. Alchea 2K base +
   catalyst + thinner), not a unit you buy. Its components are ordinary procured
   `material` items (which get offers); rolling those up into a $/sqft material
   cost is a future "composite items" model that needs **no** offers-table
   change. Until then a finish keeps a manual inline $/sqft.
5. **Labour is excluded from the Catalog entirely.** Assembly/install/delivery/
   design time is a time-and-motion analytics concern, not a price-book entry,
   and gets its own catalogue + analytic model as a separate feature. The legacy
   `labour`/`service` kinds keep an inline price as a stopgap.
6. **Suppliers are their own table, not CRM contacts** — with an optional
   `contact_id` link. The estimator `LineItem` gains an inert `offerIdSnapshot`
   so a quote remembers _which_ offer it was priced from (the seam a future
   cart-loading agent needs to group a job's lines by supplier).

## Alternatives considered

- **Route every kind through offers (uniform model).** Rejected. Finish, labour,
  and service are priced in-house; forcing them through suppliers/offers means
  minting a phantom "Good Woods" supplier and a self-offer per item, and the
  cheapest/preferred UI is meaningless for them.
- **Drop `unit_price` entirely, derive price only from offers** (the original
  plan). Rejected. Leaves in-house items and offer-less procured items with no
  price, and complicates the back-compat `Material`/`Finish` projections.
- **Per-offer units with unit-aware "cheapest".** Rejected. Comparing $145/sheet
  vs $4.60/sqft is nonsense; unit-aware comparison adds UI and rules for an edge
  case better modelled as two distinct items.
- **Suppliers = CRM contacts.** Rejected. A supplier is not a customer; coupling
  the two muddies both. An optional link preserves the association without the
  coupling.
- **Keep labour as a catalog kind.** Rejected. It answers a different question
  ("where does shop time go?") with a different data shape (event log of actuals
  vs a catalog of rates).

## Consequences

- Phase 2 adds `catalog_suppliers` + `catalog_offers` (additive) and drops only
  `catalog_items.supplier`. `Material`/`Finish` back-compat shapes are unchanged
  because their `unitPrice`/`supplier` now read the surfaced offer.
- The finish-recipe ("composite items") and labour-analytics features are
  unblocked but explicitly out of scope; neither requires re-touching the offers
  schema.
- "Cheapest" stays a trivial, trustworthy comparison at the cost of occasionally
  splitting a material into per-size items.
- The glossary for all of this lives in `features/catalog/CONTEXT.md`.
