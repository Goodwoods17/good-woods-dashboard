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

## Phase 1 — Partners hub & profiles (read-first)  ⬜

- ⬜ `/partners` hub + tab nav (`PartnersView`), nav entry added.
- ⬜ `SuppliersList` + `SubtradesList` (search, active filter).
- ⬜ `SupplierDetail` (`/suppliers/[id]`) — hero **"What we buy here"** reads
  `useCatalog()` offers for this supplier + delta chips; contact block.
- ⬜ `SubtradeDetail` (`/subtrades/[id]`) — hero **"Jobs worked"** from
  `job_trades`; trade pill; contact block. (Empty until Phase 2 writes lines.)
- ⬜ `SubtradeForm` create/edit (inline mini-form, not Modal); soft-delete.
- ⬜ Empty states teaching the next action (serif headline + ink-pill CTA).
- **Gate:** authed browser smoke — create a subtrade, open both profiles.

## Phase 2 — Trades on the project page  ⬜

The heart of the feature.

- ⬜ `TradesCard` on `/jobs/[id]` (sibling to Parties card), via `features/jobs`.
- ⬜ `TradeLineRow` — color dot + icon + trade + subtrade combobox (assign /
  reassign / leave TBD); status; optional `cost` input; notes.
- ⬜ `TradeSuggestionStrip` — registry defaults as tap-to-add chips; nothing
  writes until tapped.
- ⬜ `Add trade` button → add a `job_trades` line (trade required, subtrade
  optional).
- ⬜ Wire `SubtradeDetail` "Jobs worked" to the now-populated lines.
- **Gate:** add an Installer + Electrician to a project, assign one, leave one
  TBD; confirm both directions (job ↔ subtrade) read correctly.

## Phase 3 — Trade registry & the color palette  ⬜

- ✅ **GATE CLEARED — `/impeccable` pass on the categorical palette (2026-06-20).**
  8-color cool-arc trade palette defined in `DESIGN.md` (frontmatter `--trade-*`
  tokens + §2 "Categorical (Trade) Palette" + "Off-Axis Categorical Rule" + Trade
  Chip component spec). Proven off every semantic axis and ≥3:1 WCAG non-text
  contrast; visually verified against the health pills (warm/cool split). Build
  consumes the tokens — do not re-derive hues.
- ⬜ `TradeRegistryEditor` in `/settings` — CRUD + reorder + suggested toggle.
- ⬜ `TradePill` + `tradeColors.ts` (maps registry trade → `--trade-*` token +
  Lucide icon; dot + icon + label, per the DESIGN.md Trade Chip spec).

## Phase 4 — Connective tissue & polish  ⬜

- ⬜ Catalog offers editor deep-links to `/suppliers/[id]`.
- ⬜ Backfill: link existing `catalog_offers` suppliers into the new profile UI;
  confirm no orphans.
- ⬜ Briefing/empty-state copy review; no em dashes.
- **Gate:** `npx tsc --noEmit` · `npm run lint` · `npm run build` · authed smoke.

---

## Non-goals (v1) — see ADR 0007

Spend/paid rollups · purchase orders · communication history · multi-contact per
vendor · subtrades on `/installer` · folding clients into Partners.

## Open follow-ups (not blockers)

- Dangling `CONTEXT.md` references in `features/catalog/CLAUDE.md` and ADR 0006
  point at a glossary file that was never created; the real glossary is
  `docs/domain.md`. Worth reconciling in a later catalog touch.
