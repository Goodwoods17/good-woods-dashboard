# Shop Labour

Time-and-motion tracking for the shop, at `/labour` (Build section).
**Deliberately separate from the Catalog** — the Catalog is a price book
("what does it cost?"); this answers "where does our shop time go?". The
two share no tables. See `docs/decisions/0006-catalog-items-vs-offers.md`
(labour exclusion) and the glossary in `CONTEXT.md`.

## What it does

1. **Live timers.** A worker picks an **operation** (e.g. "Assemble base
   cabinet"), themselves, and optionally a **job**, and taps Start. The
   session runs (ticking elapsed) until Stop. **Many timers run at once**
   — multiple workers/stations in parallel.
2. **Bottleneck finder.** Completed sessions roll up by **category** and
   by **operation** (total + average time, sample count), sorted slowest-
   first, so the jam in the shop is visible.
3. **Estimator auto-suggest.** Operations tagged to a **cabinet type**
   compare their tracked average against `catalog_cabinet_types`
   assembly minutes; on a meaningful drift (≥3 samples, >10% and >3 min)
   a nudge appears — "Base assembly runs 72m, not 60m" — and **Apply**
   writes the new value to `catalog_cabinet_types`. Andrew approves;
   nothing auto-updates silently.

   > ⚠️ **Loop not fully closed yet.** Today `EstimatorView` derives
   > assembly hours from the hard-coded `DEFAULT_ASSEMBLY_MINUTES` in
   > `features/estimator/lib/types.ts`, **not** from `catalog_cabinet_types`.
   > So Apply updates the canonical table but doesn't change quotes until
   > the estimator is wired to read that table — its own already-planned
   > item (estimator `PLAN.md` Phase 2: "Cabinet-type minutes from Catalog").
   > This feature deliberately writes the right home; that one-line swap
   > closes the loop and should be done with Andrew so any quote shift is
   > reviewed. The seeded table values match the current constants, so the
   > swap is behaviour-preserving until a suggestion is applied.

4. **Setup.** Categories, operations, and workers are all **editable and
   addable at runtime** (data, not enums) so unforeseen steps need no
   migration. Removal is a soft-delete (`active=false`) — history stays.

No Anthropic API spend — pure CRUD + analytics. Any future AI insight
must run off the Max plan via an agent/scheduled task, never a metered
API key (see global memory `billing-prefer-max-plan-over-api`).

## Data model

Four tables (`supabase/migrations/20260611000000_shop_labour.sql`), RLS
authenticated-only, seeded server-side (categories/operations/worker):

- **`labour_categories`** — `id` (slug), `label`, `sort`, `active`. The
  six workflow-aligned defaults (Design · CNC/Cut · Assembly · Finishing
  · Delivery · Install) mirror the estimator sections so the auto-suggest
  maps 1:1.
- **`labour_operations`** — `name`, `category_id`, `cabinet_type`
  (base/wall/tall/island → drives the nudge), `default_minutes`,
  `active`.
- **`labour_workers`** — `name`, `active` (the roster).
- **`labour_sessions`** — the event log: `operation_id`, `category_id`
  (snapshot at start, so re-categorising never rewrites history),
  `worker_id`, `job_id` (soft ref, no FK — keeps labour decoupled from
  jobs), `started_at`, `ended_at` (null = running), `note`.

## Where things live

```
features/labour/
├── lib/
│   └── labourStore.tsx   types, LabourProvider, useLabour, timers, CRUD,
│                         operationStats/categoryStats, suggestions +
│                         applySuggestion, useNow/formatDuration helpers
└── components/
    ├── LabourView.tsx          tab nav (Timers | Bottlenecks | Time cards | Setup)
    ├── TimersBoard.tsx         start control + running cards + recent
    ├── BottleneckAnalytics.tsx category/operation bars + estimator nudges
    ├── TimeCardsView.tsx       per-employee + per-project daily hours from
    │                           `labour_sessions`; corrections via
    │                           `updateSession`/`deleteSession`; CSV export
    │                           (hours only, no $)
    └── LabourSetup.tsx         operations/categories/workers editors
```

`src/app/labour/page.tsx` is a 2-line shell. `LabourProvider` is mounted
in `src/app/layout.tsx` (inside `RefaceProvider`). The store also reads
`catalog_cabinet_types` (and writes `assembly_minutes` on Apply) for the
auto-suggest loop; the estimator otherwise owns those defaults.

## Non-goals (this build)

No per-worker rate $ costing yet (cost-per-job is a follow-on — multiply
durations by `workspace_settings` rates) · no scheduling/capacity planner
· no shift clock-in. Time-card corrections now support editing a session's
date, hours, and quantity via `updateSession` (Slice B Part 2); CSV export
of daily hours is also available from the Time cards tab. The auto-suggest
only touches assembly minutes; install/loading defaults are untouched for
now. Per-worker $ rate costing remains a non-goal for this build.

## When to revisit

- **Labour cost per job** — sum session durations × the right
  `workspace_settings` rate, surfaced on the Job and reconciled against
  the estimator's quoted labour.
- **Install/loading auto-suggest** — extend the nudge to those minute
  defaults once operations are tagged for them.
- **Per-worker throughput** — the data already carries `worker_id`; add a
  by-worker breakdown to the bottleneck view.
