# Catalog attributes editor + empty-state — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> **Worktree:** all work in `/home/andrew/projects/gw-catalog` (branch `feat/catalog-surface-kinds`). Stay strictly inside `features/catalog`. NO migration. Use `git -C /home/andrew/projects/gw-catalog` for git.

**Goal:** A generic key–value `attributes` editor on every catalog item (string values; `coats` stays reserved to its finish stepper), in-house rows gain an expansion, and empty categories show an "add the first one" state.

**Architecture:** pure helpers (`attributes.ts`) → `AttributesEditor` component → wire into `CatalogTable` (desktop `CatalogRow` + mobile `CatalogItemCard`: expansion for all kinds) → empty-state in `CatalogCategoryCard`. Spec: `docs/superpowers/specs/2026-06-22-catalog-attributes-editor-design.md`.

## Global Constraints
- TS strict; Tailwind tokens only (match existing catalog components: `bg-surface-muted`, `text-text-{primary,secondary,tertiary}`, `border-border`/`border-border-faint`, `rounded-md`, `duration-fast`, `focus:ring-accent-soft`). No hex.
- No `Set`/`Map` spread or `for…of` over a `Set`.
- Tests: `tsx` `node:assert/strict` under `scripts/`, run `npx tsx scripts/<name>.ts`.
- Persistence is the existing `updateItem(id, { attributes })` — do NOT add a store method or touch the DB.
- `CatalogItemView.attributes` is `Record<string, unknown>` (already round-trips via `catalogRowMap`). `CatalogKind` + `isProcured` live in `catalogRowMap`/`catalogStore`.
- Per-task gate: `npx tsc --noEmit` clean + the task's test. Full gate (`lint`, `build`) at the last task.
- Commit after each task; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Pure attribute helpers + test

**Files:** Create `features/catalog/lib/attributes.ts`, `scripts/test-catalog-attributes.ts`.

**Interfaces:**
- `RESERVED_ATTR_KEYS: Partial<Record<CatalogKind, string[]>>` = `{ finish: ["coats"] }`.
- `visibleAttrs(attributes: Record<string, unknown>, kind: CatalogKind): [string, string][]` — entries minus reserved keys for that kind, value coerced to string (`String(v ?? "")`), sorted by key for stable order.
- `setAttr(attributes, key: string, value: string): Record<string, unknown>` — returns a new object; trims `key`; **ignores blank key** (returns input unchanged); upserts `key→value` (string).
- `removeAttr(attributes, key: string): Record<string, unknown>` — returns a new object without `key`.

- [ ] **Step 1: failing test** `scripts/test-catalog-attributes.ts`:
```ts
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { visibleAttrs, setAttr, removeAttr } from "../features/catalog/lib/attributes";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

check("visibleAttrs excludes reserved coats for finish, coerces to string, sorts", () => {
  const r = visibleAttrs({ coats: 2, sheen: "matte", grit: 220 }, "finish");
  assert.deepEqual(r, [["grit", "220"], ["sheen", "matte"]]);
});
check("visibleAttrs keeps all keys for non-finish kinds", () => {
  const r = visibleAttrs({ finish: "nickel", overlay: "full" }, "hardware");
  assert.deepEqual(r, [["finish", "nickel"], ["overlay", "full"]]);
});
check("setAttr upserts + trims key, returns new object", () => {
  const a = { finish: "nickel" };
  const b = setAttr(a, "  overlay ", "full");
  assert.deepEqual(b, { finish: "nickel", overlay: "full" });
  assert.notEqual(a, b); // immutable
  assert.equal(setAttr(b, "overlay", "half").overlay, "half"); // update
});
check("setAttr ignores blank key", () => {
  const a = { x: "1" };
  assert.deepEqual(setAttr(a, "   ", "v"), a);
});
check("removeAttr deletes the key immutably", () => {
  const a = { finish: "nickel", overlay: "full" };
  const b = removeAttr(a, "overlay");
  assert.deepEqual(b, { finish: "nickel" });
  assert.notEqual(a, b);
});
console.log(`\n${passed} checks passed.`);
```
Run → fails (module missing).

- [ ] **Step 2: implement `features/catalog/lib/attributes.ts`.** Import `CatalogKind` (from `@features/catalog/lib/catalogStore` — confirm the export there; it's the kind union). Iterate entries with `Object.entries` (array, fine). `visibleAttrs`: filter out keys in `RESERVED_ATTR_KEYS[kind] ?? []`, map value→`String(v ?? "")`, `.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)`. `setAttr`: `const k = key.trim(); if (!k) return attributes; return { ...attributes, [k]: value };`. `removeAttr`: `const { [key]: _drop, ...rest } = attributes; return rest;`.
- [ ] **Step 3:** run → `5 checks passed.`; `npx tsc --noEmit` clean. Commit (`feat(catalog): pure attribute helpers (visibleAttrs/setAttr/removeAttr) + test`).

---

### Task 2: `AttributesEditor` component

**Files:** Create `features/catalog/components/AttributesEditor.tsx`.

**Interfaces:**
- `AttributesEditor({ attributes, kind, onChange }: { attributes: Record<string, unknown>; kind: CatalogKind; onChange: (next: Record<string, unknown>) => void })`.

- [ ] **Step 1: build it** (`"use client"`).
  - Render `visibleAttrs(attributes, kind)` as rows: each row = a key label (read-only text, `font-mono text-xs text-text-secondary`), the value as an inline editable `<input>` (controlled by local state seeded from the value; on blur/Enter → `onChange(setAttr(attributes, key, e.target.value))`), and a remove `✕` button (`aria-label={`Remove ${key}`}` → `onChange(removeAttr(attributes, key))`).
  - An **add row**: two inputs (`key` placeholder "attribute", `value` placeholder "value") + an "Add" button. On Add (or Enter in the value field): if key trims non-empty, `onChange(setAttr(attributes, keyInput, valueInput))` and clear both inputs. Ignore blank key.
  - Header: a small `text-label uppercase text-text-tertiary` "Attributes" caption.
  - Empty (no visible attrs): show a muted "No attributes yet" hint above the add row (don't hide the add row).
  - Tokens only; inputs styled like the table's inline inputs (`rounded-md bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-soft`). Touch targets ≥32px. No hex.
- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit (`feat(catalog): AttributesEditor — generic key-value editor`).

---

### Task 3: Wire expansion + AttributesEditor into the table (all kinds)

**Files:** Modify `features/catalog/components/CatalogTable.tsx`.

**Context (verified):** desktop `CatalogRow` renders the expansion sub-row at the bottom gated `{procured && expanded && (<tr>…<OffersEditor/></tr>)}` (line ~478). The toggle for procured rows is the `SuppliersStrip` button. In-house rows render `InHouseDetail` (the coats stepper for finish / a flat label) with **no toggle and no expansion**. Mobile `CatalogItemCard` mirrors this.

- [ ] **Step 1 (desktop `CatalogRow`):**
  - Change the expansion sub-row condition from `procured && expanded` to **`expanded`**, and inside the `<td colSpan=…>` render `{procured && <OffersEditor view={view} deltas={deltas} />}` **and always** `<AttributesEditor attributes={view.attributes} kind={view.kind} onChange={(next) => onChange({ attributes: next })} />` (stack them with a small gap; put Attributes below Offers).
  - Give **in-house rows a toggle**: pass `expanded` + `onToggle` into `InHouseDetail`, and in `InHouseDetail` append a small chevron toggle button after the label (`aria-expanded={expanded}`, `aria-label="Attributes"`, a `ChevronDown` from lucide rotating when open — mirror the SuppliersStrip chevron style). Keep the coats `<input>` working (the chevron is a separate button, not wrapping the input). Procured rows keep `SuppliersStrip` as the toggle (unchanged).
- [ ] **Step 2 (mobile `CatalogItemCard`):** same — render `<AttributesEditor>` in its expanded area for all kinds; ensure in-house cards can toggle (add the same chevron in the mobile `InHouseDetail` usage or a small "Attributes" button).
- [ ] **Step 3:** import `AttributesEditor`; `npx tsc --noEmit` clean. Commit (`feat(catalog): expand any row to edit attributes (offers + attributes for procured; attributes for in-house)`).

---

### Task 4: Empty-category state + full gate

**Files:** Modify `features/catalog/components/CatalogCategoryCard.tsx`; update `features/catalog/CLAUDE.md` (or `PLAN.md`) with a one-line note.

- [ ] **Step 1:** In `CatalogCategoryCard`, where a category's (and each subcategory's) item list renders: when the item count for that group is **0**, render a muted line `No items yet — add the first one` (`text-xs text-text-tertiary`) directly above the existing "+ Add to …" button, so empty Labour/Services read as intentional. Don't remove or duplicate the add button. (Read the component first to place it at the right group level.)
- [ ] **Step 2:** Doc note — `features/catalog/CLAUDE.md`: the generic attributes editor (expand any row) + empty-category state; `coats` stays a finish-only reserved key.
- [ ] **Step 3: full gate** — `npx tsc --noEmit` clean; `npm run lint` clean; `npx tsx scripts/test-catalog-attributes.ts` green; `npm run build` OK (`/catalog` builds).
- [ ] **Step 4:** Commit (`feat(catalog): empty-category state + docs — attributes/empty-state slice complete`).

---

## Self-Review
**Spec coverage:** generic editor (T1+T2) ✓; string values + reserved `coats` (T1 `visibleAttrs`/`RESERVED_ATTR_KEYS`) ✓; in-house rows expand (T3) ✓; offers+attributes for procured (T3) ✓; empty-state (T4) ✓; persists via `updateItem({attributes})` (T2/T3 onChange) ✓; no migration / consumers untouched ✓.
**Placeholder scan:** T1 fully coded; T2–T4 give structure + exact props + the existing components/lines to mirror.
**Type consistency:** `Record<string, unknown>` attributes + `CatalogKind` used consistently T1→T2→T3; `visibleAttrs`/`setAttr`/`removeAttr` (T1) consumed in T2; `onChange({ attributes })` matches `updateItem` patch shape.
**Verify-at-build:** the exact `CatalogKind` export location (T1 import); the precise `InHouseDetail` signature to extend + mobile `CatalogItemCard` expanded area (T3); the per-group item-count spot in `CatalogCategoryCard` (T4).
