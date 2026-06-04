# Estimator — Implementation Plan

Backfilled 2026-06-02 to record what's shipped and sequence what's left.
Canonical behaviour lives in `CLAUDE.md`; this file tracks **status and
order of work**.

## Status legend

✅ done · 🟡 partial · ⬜ not started

## Phase 1 — Mozaik-shaped quote builder ✅

- ✅ Uniform line-item grid (`category · item · qty × unit × $/unit`),
  per-line waste % and markup %, marked-up price display.
- ✅ `computeTotals` pricing math (waste → cost → markup → overhead),
  negative-input clamping.
- ✅ Cabinet summary (counts + linear ft).
- ✅ "Save as Job" → draft Job in `sold`, costs bucketed, invoice lines
  reconcile to `job.revenue`.
- ✅ Sidebar quote summary with effective margin %.

_Commits: `c635db4`, `fdb59ad`, `a90e15e`, `5320c43`._

## Phase 1.5 — 10-category restructure ✅

- ✅ Fixed 10 sections (pre-work → deficiencies) with bucket + layout
  metadata (`sections.ts`).
- ✅ Bespoke blocks: PreWork (internal-only), Delivery (distance/time/
  loading), Deficiencies (hours budget + contingency %).
- ✅ Templates (5 built-in + custom in localStorage) toggling whole
  sections.
- ✅ Rooms — per-line / per-cabinet `roomId`, enable/disable removes
  contribution from cost + quote + invoice.
- ✅ Three labour rates (design / shop / install) in workspace settings.
- ✅ Cabinet types incl. island; auto-derive Assembly / Install /
  Delivery-loading hours from counts × per-type minutes.
- ✅ Contingency treated as expected labour in both margin math and the
  saved Job's CostLines (they reconcile).

_Commits: `d859c0f`, `1114d65`. Design pass: `5443932`, `7bc5986`,
`c9a872f`._

## Open gaps (small, do-anytime) 🟡

- ⬜ **Draft-estimate persistence.** The estimate isn't saved to
  Supabase — closing `/estimator` loses everything until "Save as Job".
  An estimates table + load/restore would let Andrew park a quote and
  come back. Decide whether this lands before or with Catalog.
- ⬜ **Custom templates → Supabase.** Currently localStorage-only
  (`gw_estimate_templates_v1`), so they don't follow Andrew across
  devices. Fold into the same migration as draft persistence.

## Phase 2 — Catalog integration ⬜

Goal: stop retyping prices. `LineItem` already carries `catalogId`,
`supplierSnapshot`, `unitPriceSnapshot`.

1. Expand Catalog to hold any reusable item (sheet goods, hardwoods,
   hinges, guides, fasteners, legs, labour rates).
2. Line row gets a "pick from Catalog" affordance → fills item/unit/price
   and snapshots supplier + price-at-pick-time.
3. "Save this line to Catalog" button (reverse direction).
4. Show a drift indicator when `unitPriceSnapshot` ≠ current catalog price.

## Phase 3 — Mozaik CSV import ⬜ _(highest leverage — do before Phase 2)_

Drop a Mozaik CSV → populate a quote:

- Section headers → categories; items → lines; unit symbols (`#/SqFt/Ft/
Hrs`) → unit codes.
- Cabinet count rows → CabinetSummary.
- `Add-On %` subtotal row → seed `defaultMarkupPct`.
- Skip zero-priced rows by default (toggle to show).

Rationale: kills the most manual data entry and is the data source the
Inventory job-needs view depends on.

## Phase 3.5 — Inventory link ⬜

Once lines carry real per-material quantities (a per-job BOM from the CSV
import), Inventory cross-checks stock-on-hand against upcoming job needs
("Henderson is short 4 sheets"). The BOM produced here is the source.
See `features/inventory/CLAUDE.md`.

## Phase 4 — Cabinet-count metrics ⬜

- $ per cabinet linear foot; assembly/install time by cabinet type.
- Move the per-type minute defaults out of `types.ts` into Catalog so
  Andrew tunes them to shop reality.
- Needs a handful of saved jobs with cabinet counts to be useful.

## Later — PDF quote export ⬜

Standalone client-facing quote PDF (separate from the invoice), reusing
the `@react-pdf/renderer` pipeline.

## Recommended next step

**Phase 3 (CSV import)** over Phase 2 — it removes the most manual entry
and unlocks Inventory. Start with `/plan-feature` to nail the Mozaik CSV
column mapping before writing the parser.
