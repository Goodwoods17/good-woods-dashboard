# Catalog — generic attributes editor + empty-category state

**Status:** Approved design (2026-06-22). Small isolated slice in `features/catalog`. No migration.
**Branch:** `feat/catalog-surface-kinds` (worktree `/home/andrew/projects/gw-catalog`), parallel to a Slice-C session — stays strictly inside `features/catalog`.
**Self-grilled** (Andrew asleep): the open branches below were resolved from the codebase + sensible defaults rather than an interactive grill.

## Problem

The catalog already surfaces and CRUDs all 7 item kinds (it's category-based since the
`catalog_categories` redesign — the old "only materials + finishes" note is stale). Two small
real gaps remain:

1. **Kind-specific `attributes` aren't editable.** `catalog_items.attributes` (jsonb,
   `Record<string, unknown>`) holds freeform per-kind metadata — a seeded hinge already carries
   `{ finish: "nickel", overlay: "full" }` — but the table only surfaces `coats` (for finishes).
   Everything else in `attributes` is invisible/uneditable.
2. **Empty categories look broken.** The Labour and Services categories exist but have no seed
   items, so their cards render empty with no guidance.

## Goal

A **generic key–value attributes editor** available on every catalog item, plus a friendly
**empty-state** for categories with no items. UI-only; no schema, no migration, no type change
(the `attributes` field already exists and round-trips through `catalogRowMap`).

## Locked decisions (self-grilled)

1. **Generic key–value editor** (Andrew chose this over typed-per-kind fields) — arbitrary
   `key: value` pairs, **string values**. The `coats` number keeps its dedicated finish stepper.
2. **Reserved keys** (have their own dedicated control → hidden from the generic editor):
   `RESERVED_ATTR_KEYS: Partial<Record<CatalogKind, string[]>> = { finish: ["coats"] }`. Default `[]`.
3. **Value type = string.** Existing non-string values (e.g. a stray number) display coerced to
   string; on save they persist as strings. `coats` is untouched (reserved).
4. **Key rules:** trimmed, non-empty; adding a key that already exists **updates** its value
   (upsert, no duplicates); blank key is ignored. Removing a row deletes that key.
5. **Persistence:** every edit calls the existing `updateItem(id, { attributes: next })` (already
   debounced + mapped to the jsonb column). No new store method.
6. **Expansion:** the table's existing `expanded: Set<string>` row mechanism is extended so
   **in-house rows expand too** (today only procured rows expand for offers). Expansion content:
   Offers (procured only) **+** Attributes (all kinds).
7. **Empty-state:** in `CatalogCategoryCard`, a muted "No items yet — add the first one" line
   when a category/subcategory has 0 items, above the existing "+ Add to …" button.
8. **Consumers unaffected:** estimator/reface/inventory read items wholesale; `attributes` is
   already in the shape — surfacing an editor changes no read contract.

## Architecture

Four units, each small and independently testable:

- **Pure helpers** `features/catalog/lib/attributes.ts`: `visibleAttrs(attributes, kind)` (entries
  minus reserved keys, as `[key,string][]`), `setAttr(attributes, key, value)` (trim+upsert,
  ignore blank key), `removeAttr(attributes, key)`. Pure `Record` transforms — unit-tested.
- **`AttributesEditor`** component (`features/catalog/components/AttributesEditor.tsx`): renders
  `visibleAttrs` rows (`key · value · ✕`) + an add row; calls back with the next attributes object.
- **`CatalogTable`** wiring: allow all rows to expand; render `<AttributesEditor>` in the
  expansion (alongside `OffersEditor` for procured kinds), wired to `updateItem`.
- **`CatalogCategoryCard`** empty-state: the muted line when item count is 0.

## Definition of Done (the smoke script)

1. Given a **hardware** item, when I expand it, then I see its `finish`/`overlay` attributes and
   can add `overlay=full`, edit a value, and remove a key — and it persists (reload shows it).
2. Given a **finish** item, when I expand it, then `coats` is **not** in the generic editor (it
   stays in its own stepper), but other attrs are editable.
3. Given an **in-house** item (labour/service), when I expand it, then I get the Attributes editor
   (no offers section).
4. Given the empty **Labour** category, then it shows "No items yet — add the first one" + the add
   button, and adding an item works.
5. `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; the attributes unit test passes.

## Out of scope

- Typed/validated per-kind attribute schemas (the explicit YAGNI choice).
- Door matrix `pricing` jsonb (that's a separate reface/Phase-2 concern).
- Numeric/boolean attribute value types (strings only).
- Any migration, any change outside `features/catalog`.

## Testing

- **Pure** (`attributes.ts`): `visibleAttrs` excludes reserved + coerces values to string;
  `setAttr` upserts + trims + ignores blank key; `removeAttr` deletes — `tsx` `node:assert`.
- **Browser smoke** (authenticated, dev on PORT 3001): the 4 DoD scenarios above.
