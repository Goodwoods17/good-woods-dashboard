# Shop Labour — implementation plan

Goal: a time-and-motion layer separate from the Catalog that turns live
shop timers into a bottleneck finder and feeds real minutes back into the
estimator. Grilled with Andrew 2026-06-09 (see memory
`project-shop-labour-analytics`).

## Phase 1 — Timers, bottlenecks, estimator nudge ✅ (2026-06-09)

- [x] Migration `20260611000000_shop_labour.sql`: `labour_categories`,
      `labour_operations`, `labour_workers`, `labour_sessions`. RLS
      authenticated-only; categories/operations/worker seeded server-side.
      **Applied + verified on the live DB** (6 cats, 11 ops, 1 worker).
- [x] `labourStore.tsx` — dual Supabase/localStorage backend; start/stop
      timers (many concurrent), session delete; CRUD for operations /
      categories / workers (soft-delete); `operationStats` / `categoryStats`
      aggregates; `suggestions` + `applySuggestion` (writes
      `catalog_cabinet_types.assembly_minutes`); `useNow`/`formatDuration`.
- [x] UI — `LabourView` (Timers | Bottlenecks | Setup), `TimersBoard`
      (start control + live ticking cards + recent), `BottleneckAnalytics`
      (category/operation bars + estimator nudges), `LabourSetup` (editable
      operations/categories/workers).
- [x] Route `/labour`, sidebar entry (Build), `LabourProvider` mounted.
- [x] Docs: CLAUDE.md, CONTEXT.md, this PLAN.

**Locked decisions (grill):** live start/stop timers · operation ×
category · bottleneck finder is the #1 output · auto-suggest with Andrew's
approval · named workers · many concurrent timers · workflow-aligned 6
categories · categories AND operations editable at runtime. No API spend.

## Phase 2 — Cost & depth

- [ ] **Labour cost per job** — durations × `workspace_settings` rates
      (design/shop/install), surfaced on the Job, reconciled to the
      estimator's quoted labour.
- [ ] **Per-worker throughput** — by-worker breakdown in the bottleneck
      view (`worker_id` already captured).
- [ ] **Install/loading nudges** — extend auto-suggest beyond assembly to
      install + loading minute defaults.
- [ ] **Session editing** — correct a mistimed start/end without delete +
      re-log.

## Phase 3 — Capacity & export

- [ ] Capacity/scheduling view (who's free, what's queued).
- [ ] CSV export of sessions for outside analysis.
- [ ] Optional shop-floor kiosk mode (big tap targets, shared tablet).
