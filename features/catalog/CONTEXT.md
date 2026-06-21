# Catalog — domain glossary

The precise vocabulary for the Catalog. A glossary, not a spec — implementation
lives in `CLAUDE.md` / `PLAN.md`. When code or conversation uses one of these
words to mean something else, that's a conflict to resolve, not a synonym.

## Catalog Item

A single thing the shop prices off, distinguished by `kind`. Every price the
shop quotes traces back to a Catalog Item.

## Procured kind vs In-house kind

- **Procured kinds** — `material`, `hardware`, `door`, `insert`. Things the shop
  **buys from outside suppliers**. These carry **Offers** (see below); their price
  is derived from offers, not stored inline.
- **In-house kinds** — `finish`, `labour`, `service`. Priced by the shop itself,
  not bought as a unit from one vendor. They keep an **inline price** on the item
  and have **no Offers**. (Labour is slated to leave the Catalog entirely — see
  _Labour_ below.)

## Offer

A specific **supplier's** price (and buy URL / SKU) for one **procured** Catalog
Item. One item can have **many offers** — e.g. 3/4" walnut MDF at $145 from Reimer
vs $165 from PJ White. Offers belong only to procured kinds.

## Supplier

A vendor the shop buys from (Reimer, PJ White, Sherwin-Williams, Columbia
Industrial, New Surrey…). Lives in its own list, referenced by Offers. Distinct
from a CRM **Contact** (a customer); a supplier _may_ optionally link to a contact
but is not one.

## Surfaced price

The single price shown for an item, and the one consumers (Estimator, Inventory)
read. Defined as: **preferred Offer if one is pinned, else the cheapest active
Offer, else the item's inline price**. So an item is never priceless, even with
zero offers.

## Preferred Offer

The one Offer an item's surfaced price is pinned to **even when it isn't the
cheapest** — chosen for quality, lead time, or relationship. At most **one per
item**. Distinct from **cheapest**, which is computed, not chosen; the UI marks
both ("★ preferred" vs "← best").

## Finish (as a recipe — future)

A `finish` (e.g. clear satin @ $/sqft) is **not** bought as a unit. It is a
**recipe** of procured materials — a base (e.g. Alchea 2K acrylic), a catalyst, a
thinner; paint is its own mix — applied per square foot. Its true material cost
should **roll up from its component materials' offers**. Until that "composite
items" model is built, a finish keeps a **manual inline $/sqft**. The component
materials themselves are ordinary procured `material` items with offers.

## Labour (separate context — not in the Catalog)

Assembly / install / delivery / design **time**. This is a time-and-motion
analytics concern ("where does shop time go?"), not a price-book entry, and is
deliberately **excluded** from the Catalog — it gets its own catalogue + analytic
model as a future feature. The legacy `labour`/`service` kinds keep an inline
price as a stopgap until then.
