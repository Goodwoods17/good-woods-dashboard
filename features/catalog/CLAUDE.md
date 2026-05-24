# Catalog

The shop's price book — Materials and Finishes used by the Estimator and
tracked by Inventory.

## What it does

Two editable tables (Materials, Finishes) wired to a React context so any
page can read/write. Seeds with 8 materials (Independent Lumber, Windsor
Plywood, Frameware Hardware, Cabinetdoors.com, Stone Tile West) and 4
finishes (2K poly, conversion varnish, hardwax oil).

Persistence is **localStorage only** today (`gw_catalog_v1` key, schema
v2 with migration from v1). Supabase backing is on the deferred list —
when it lands, do it via `createDualStore` in `shared/lib/` so the
pattern matches jobsStore (architecture review 2026-05-24 candidate #7).

## Where things live

```
features/catalog/
├── lib/
│   └── catalogStore.tsx     Material/Finish types, CatalogProvider,
│                            useCatalog hook, seed data
└── components/
    ├── CatalogView.tsx      top-level view with tab nav
    ├── MaterialsTable.tsx   materials CRUD table
    ├── FinishesTable.tsx    finishes CRUD table
    └── CrudTable.tsx        shared Th + CrudRow<T> primitives
```

`src/app/catalog/page.tsx` is a 4-line shell that renders
`<CatalogView />`. The provider is mounted in `src/app/layout.tsx`
(sits inside `AuthProvider`). Routes that consume it:

- `/catalog` — direct CRUD on materials and finishes
- `/estimator` — reads materials/finishes for line item pricing
- `/inventory` — reads materials for stock-on-hand tracking

## Domain notes

- `pricePerSqft` is the primary cost field for both materials and
  finishes. For non-area items (hinge pair, edgebanding linear ft), this
  field still holds the unit price — see `notes` for clarification.
- Edits are append-only in spirit: deleting a material that's referenced
  by an active estimate is currently allowed but will leave dangling refs.
  If that becomes a problem, add a soft-delete flag.

## When to revisit

- Add a new pricing dimension (e.g. labour rates, overhead %) → consider
  whether it belongs in catalog or as its own feature.
- If suppliers grow past ~20, the supplier field probably wants to become
  its own table with its own page.
