# Inventory

Stock-on-hand tracking for the materials in the Catalog.

## What it does

Single page (`/inventory`) listing each tracked material with its
quantity-on-hand and reorder point. Materials whose qty falls at or below
their reorder point appear in a "low stock" banner at the top.

Stock entries persist to **Supabase** (`public.inventory_items`, migration
`20260529010000_inventory_items.sql`) with a localStorage fallback when no
Supabase env is present. Each entry can link to a Catalog material by
`materialId` (a soft text ref, no hard FK) and snapshots `materialName`,
`unit`, and `unitValue` so the row stays self-describing if the catalog
entry later changes. Free-text entries (no catalog link) are allowed.

The page leads with **Reorder now** (items at/below their reorder point,
each with a one-tap "Reordered" that flags it on-order until restocked),
then the full editable register. Responsive: table on desktop/tablet,
stacked cards on phone.

## Planned link: Inventory ↔ Estimator (job material needs)

The "do we have enough stock to finish upcoming jobs?" view is **not built
yet** and is intentionally deferred. It needs per-job material quantities (a
bill of materials), which will come from the **Estimator** once the **Mozaik
CSV import** lands (parse a Mozaik parts list into estimator lines → per-job
BOM). When that exists, Inventory will show shortfalls like "Henderson is
short 4 sheets." Keep these two features linked. See
`features/estimator/CLAUDE.md`.

## Where things live

```
features/inventory/
├── lib/
│   └── inventoryStore.ts    StockEntry type, load/save, SEED_STOCK
└── components/
    ├── InventoryView.tsx    top-level: header + banner + table
    ├── StockTable.tsx       the editable on-hand table
    └── LowStockBanner.tsx   "N items need reorder" alert
```

`src/app/inventory/page.tsx` is a 4-line shell.

Depends on `@features/catalog/lib/catalogStore` — to look up material
names from `materialId`.

## Domain notes

- `qtyOnHand` is in whatever unit makes sense for the material (`bd-ft`,
  `sheets`, `rolls`, `pairs` for hinges). The unit is stored per-entry,
  not derived from the material.
- A new `StockEntry` requires picking an existing `materialId` from the
  catalog. There's no dangling-ref protection yet — deleting a material
  in Catalog will leave its inventory entry orphaned.

## When to revisit

- Cross-device inventory needed → add Supabase persistence (mirror the
  catalog dual-mode pattern).
- Reorder workflow (auto-create POs, link to suppliers) → that's a real
  feature, plan it.
