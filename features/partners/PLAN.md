# Partners — Implementation Plan

Phased roadmap for supplier + subtrade profiles and project trade-coordination.
Spec: `features/partners/CLAUDE.md`. Decisions: ADR 0007. Keep this file current
as work lands (per project convention).

Status legend: ⬜ not started · 🟡 in progress · ✅ done

---

## Phase 0 — Schema & data layer  ✅  (2026-06-20, commit 2c285ac)

The foundation. Additive only; nothing existing is dropped. Migration applied to
the live project + verified (8 trades seeded, 4 suggested, 6 new supplier cols,
RLS on all 3 tables); `tsc --noEmit` + `next lint` clean.

- ✅ Migration `supabase/migrations/20260620000000_partners.sql`:
  - `subtrades` table (+ RLS authenticated-only).
  - `trades` registry table (+ RLS), **seeded** with installer, finisher,
    countertop, electrical, plumbing, delivery, upholstery, other — each with a
    placeholder color token, icon key, and `is_suggested_default`.
  - `job_trades` join table (+ RLS), FKs to `jobs`, `trades`, `subtrades`
    (subtrade `ON DELETE SET NULL`, job `ON DELETE CASCADE`).
  - `ALTER TABLE catalog_suppliers ADD` `contact_name`, `phone`, `address`,
    `account_number`, `lead_time_note`, `active default true`.
- ✅ Types + row maps (`lib/types.ts`, `lib/rowMaps.ts`): `Subtrade`, `Trade`,
  `JobTrade`, enriched `CatalogSupplier`.
- ✅ Stores: `subtradesStore.tsx`, `tradesStore.tsx`, `jobTradesStore.tsx`
  (Supabase + `localStorage` fallback, mirroring catalog/contacts; trades store
  seeds the registry in fallback). Providers mounted in `src/app/layout.tsx`.
- ✅ **Gate met:** `npx tsc --noEmit` clean; migration applied + seed verified.

## Phase 1 — Partners hub & profiles (read-first)  ✅  (2026-06-20, commit 9de31bd)

`tsc --noEmit` + `next lint` clean. Browser smoke confirmed the hub, suppliers
list, and a supplier profile render with live catalog data. Trade-populated views
(trade pills, subtrade create) need an authenticated session — authenticated-only
RLS, same pattern as catalog; the trade-pill visual is proven in the DESIGN.md
palette render. Final authed create-flow check rides along with Andrew's login.

- ✅ `/partners` hub + tab nav (`PartnersView`), nav entry added.
- ✅ `SuppliersList` + `SubtradesList` (search, active filter).
- ✅ `SupplierDetail` (`/suppliers/[id]`) — hero **"What we buy here"** reads
  `useCatalog()` offers for this supplier; contact block. (Price-delta chips: later.)
- ✅ `SubtradeDetail` (`/subtrades/[id]`) — hero **"Jobs worked"** from
  `job_trades`; trade pill; contact block. (Empty until Phase 2 writes lines.)
- ✅ `SubtradeForm` create/edit; soft-delete (archive).
- ✅ Empty states teaching the next action (serif headline + ink-pill CTA).
- 🟡 **Gate:** rendering smoke done; authed create-a-subtrade check pending a real login.

## Phase 2 — Trades on the project page  ✅  (2026-06-20, commit 51728d8)

The heart of the feature. `tsc` + `lint` clean; full authed browser smoke
verified both directions (assign on the job → shows on the subtrade profile).

- ✅ `TradesCard` on `/jobs/[id]` OverviewTab (sibling to Parties), via
  `features/partners` (imported like DocumentsCard).
- ✅ Trade-line row — trade pill + status (needed/booked/done) + remove +
  optional `cost`; Company (subtrade) select, then Person select scoped to that
  subtrade's people (`job_trades.person_id` = the specific installer).
- ✅ Suggestion strip — registry `is_suggested_default` trades not yet on the
  job, tap-to-add; nothing writes until tapped.
- ✅ Add-trade picker → adds a `job_trades` line (subtrade null = TBD).
- ✅ `SubtradeDetail` "Jobs worked" reads the populated lines (both directions).

## Phase 3 — Trade registry & the color palette  ✅  (2026-06-20, commit 0936a6e)

- ✅ **GATE CLEARED — `/impeccable` pass on the categorical palette (2026-06-20).**
  8-color cool-arc trade palette defined in `DESIGN.md` (frontmatter `--trade-*`
  tokens + §2 "Categorical (Trade) Palette" + "Off-Axis Categorical Rule" + Trade
  Chip component spec). Proven off every semantic axis and ≥3:1 WCAG non-text
  contrast; visually verified against the health pills (warm/cool split). Build
  consumes the tokens — do not re-derive hues.
- ✅ `TradeRegistryEditor` in `/settings` — rename, recolour (8-swatch palette),
  set icon, reorder (sort_order swap), suggested toggle, archive/restore, add.
- ✅ `TradePill` (in Phase 1) — `tradeColorVar` + `tradeIcon` helpers map a
  registry trade → `--trade-*` token + Lucide icon; dot + icon + label per the
  DESIGN.md Trade Chip spec. (No separate `tradeColors.ts`; helpers live in
  `TradePill.tsx`.)

## Phase 4 — Connective tissue & polish  ✅  (2026-06-20, commit 61136e6)

- ✅ Catalog offers editor deep-links to `/suppliers/[id]` ("View profile" under
  each offer's supplier picker).
- ✅ Backfill / orphan check: 0 orphaned offers, trade-lines, or people. Existing
  catalog suppliers already surface in the Partners hub + profiles (same rows).
- ✅ Em-dash scrub on the new UI (Trades-card person dropdown separator → parens).
- ✅ **Gate met:** `tsc --noEmit` clean · `next lint` clean · `npm run build`
  green (all partners routes compiled) · authed end-to-end smokes throughout
  Phases 1-3.

**Feature complete.** All four phases shipped on `feat/partners` (unpushed).

---

## Non-goals (v1) — see ADR 0007

Spend/paid rollups · purchase orders · communication history · multi-contact per
vendor · subtrades on `/installer` · folding clients into Partners.

## Open follow-ups (not blockers)

- Dangling `CONTEXT.md` references in `features/catalog/CLAUDE.md` and ADR 0006
  point at a glossary file that was never created; the real glossary is
  `docs/domain.md`. Worth reconciling in a later catalog touch.
