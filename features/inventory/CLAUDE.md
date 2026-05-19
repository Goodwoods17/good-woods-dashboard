# Inventory

Stock-on-hand tracking for the materials in the Catalog.

## What it does

Single page (`/inventory`) listing each tracked material with its
quantity-on-hand and reorder point. Materials whose qty falls at or below
their reorder point appear in a "low stock" banner at the top.

Stock entries are local-only — persisted to `localStorage` under
`gw_inventory_v1`. Unlike Jobs and Catalog, this does **not** sync to
Supabase yet (intentional: low-stakes data, single-shop use).

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
