# Job Costing (Cost Codes & Live Budget-vs-Actual)

Estimate-vs-actual job costing: cost codes (labour operations under the 6
phases) flow **estimate → job budget → live actuals → P&L rollup**, with a
learning loop feeding historical averages back into bids. The point is to know
_mid-job_ whether a job is making money, in time to act this shift.

**Canonical design:** `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md`
plus ADRs **0008** (milestones = phases), **0009** (budget-on-job), **0010**
(QuickBooks-ready). Read those before touching this feature. Glossary terms
(Phase, Cost code, Driver, Budget, Cost-actual, Estimate, Invoice, Change order)
live in `docs/domain.md`. UI craft direction:
`docs/superpowers/specs/2026-06-20-cost-codes-ui-design-brief.md`.

## Status

- **P0** (prerequisite, ADR 0008) — `MilestoneStage` realigned to the 6 phases. Done.
- **P1** (this) — additive schema + entity types. Migration
  `supabase/migrations/20260620050000_cost_codes_schema.sql` is written but
  **NOT yet applied** to the shared DB (coordinate with the parallel session +
  a deploy). Types in `lib/types.ts`.
- **P2–P3** — registry/templates in `/labour`, estimator panel. Done (ADR 0012 Slices A/1/2).
- **P4** — the **Budget-vs-Actual tab** on `/jobs/[id]`. Done (labour + materials; ADR 0014).
- **P5–P6** — `/pnl` open-jobs rollup + Burn-up/Projection views; the learning loop. See spec §10.

### P4 — Budget-vs-Actual tab (ADR 0014)

A "Budget vs Actual" tab on `/jobs/[id]` answers "is this job making money, mid-job?"

- **Pure data layer** `lib/budgetVsActual.ts` (tested by `scripts/test-budget-vs-actual.ts`):
  `computeBudgetVsActual(input)` → per-phase/per-code labour rollup + the margin math;
  plus the row→input mappers (`rowsToLabourBudget`, `sessionsToLabourActuals`,
  `materialActualTotal`, `subtradeBudgetTotal`).
- **Loader** `lib/budgetVsActualStore.tsx` (`useBudgetVsActual(jobId)`) reads
  `job_cost_budgets` (labour), `labour_sessions` (actuals), `job_cost_actuals`
  (material), `job_trades` (subtrade budget); `logActual` writes a material actual.
- **UI** `components/BudgetVsActualTab.tsx` + `components/bva/{TimelineView,PhaseBarsView,PaceMarginView}.tsx`.
- **Structure (where a budget exists at that grain):** labour = per-phase + per-code
  variance; materials = **job-level** budget (`job.costs` materials) vs logged actuals;
  subtrades = **budget only** (`Σ job_trades.cost`, actuals deferred to Slice C);
  overhead = job-level fixed.
- **Margin is anchored to the quoted margin + tracked drift** (`computeMargin(job).marginAmount
− labourDrift − materialDrift`), so it matches the Pipeline number and equals the quote
  when there are no actuals. **Overhead is a silent constant** (no actual → cancels out of
  Clawback). Labour actual-$ uses each budget row's **snapshot `rate`**. Header is labelled
  **"(excl. subtrade actuals)"** until Slice C tags `job_trades` with phases.
- **Data source:** estimator's _Save as Job_ (writes `job_cost_budgets`). Budget-less jobs
  show an empty state pointing to the estimator (no backfill — ADR 0014).
- **Smoke fixture:** `scripts/seed-bva-smoke.ts [jobId] [--clean]` seeds/cleans demo
  budget+actuals on an example job (the dashboard holds only example jobs today).

## Where things live

```
features/job-costing/
├── CLAUDE.md
├── components/
│   └── CostCodesPanel.tsx   estimator "Labour cost codes" block: budget rows by
│                            phase, editable qty/minutes, reconciliation note
└── lib/
    ├── types.ts       DriverUnit, CostCodeTemplate(+Item), JobEstimate, JobInvoice,
    │                  JobCostBudget, JobCostActual
    ├── costCodes.ts   CANONICAL_COST_CODES (SEED MIRROR only — not the runtime
    │                  source), phase labels/order, rateForPhase, plus
    │                  buildCostCodeRegistry / registryFromDefs / CostCodeRegistry /
    │                  TOTAL_CABINET_COUNT_CODES (Slice A)
    ├── budget.ts      deriveCostCodeBudget (counts → budget rows) +
    │                  reconcileBudgetVsQuote + derivePerRoomBudgets. Pure;
    │                  tested by scripts/test-job-costing-budget.ts
    └── saveBudget.ts  saveJobBudget: writes job_estimates + job_cost_budgets
                       (labour rows) at Save-as-Job — split by room_label when a
                       Mozaik per-room snapshot is passed, else job-level
```

The Budget-vs-Actual tab and the `/pnl` rollup arrive in P4–P5.

### ADR 0012 — unified Job template (Slice 1, shipped on `feat/job-templates`)

The estimator's `EstimateTemplate` now carries a `costCodeSet` (string keys into
`costCodes.ts`). The cabinet summary fills the driven quantities (ASM/INST per
type, DEL-LOAD = total count); finishing sqft / cut sheets are manual now and
Mozaik-filled in Slice 2. The canonical codes are seeded into `labour_operations`
by `20260622130000_seed_cost_codes.sql` (idempotent upsert keyed by `code`).
`CANONICAL_COST_CODES` (TS) and that seed must stay in lockstep. Save-as-Job
freezes the labour budget; **material/subtrade budget rows are deferred** (materials
land with the Mozaik BOM in Slice 2; subtrades read live from `job_trades`).

**Slice 2 follow-ons (shipped):** (1) a Mozaik import splits the frozen budget by
room — `job_cost_budgets.room_label` (migration `20260622140000`), written from the
import's per-room snapshot only when it still reconciles to the job-level budget
(count edits fall back to job-level). (2) BOM lines name-match the catalog on import
(`features/estimator/lib/bomCatalogMatch.ts`) so they carry real prices, not $0.

### ADR 0012 grill — Slice A: cost codes are a LIVE registry (shipped on `feat/job-templates`)

Cost codes are **user-managed data**, not a hardcoded list. Add/edit them in
`/labour → Setup → Cost codes` (phase **required** on add — it's the code's shop-floor
kanban column). The estimator/budget resolve codes from the live `labour_operations`
registry: `EstimatorView` builds a `CostCodeRegistry` from `useLabour().operations` via
`buildCostCodeRegistry` and threads it into `deriveCostCodeBudget`. `CANONICAL_COST_CODES`
is now just the **seed mirror**. A code only budgets if it's in the active template's
`costCodeSet`, so `templates.ts` lists the component codes in the templates that install
them. **Implication:** the cost-code panel is now RLS-gated — it needs an authenticated
session to populate (empty otherwise; graceful empty-state, but Save-as-Job doesn't block
on an empty registry). Seeded 4 starter component codes (`INST-INSERT`, `INST-ROLLOUT`,
`HW-PULL`, `FIT-DOOR`; migration `20260622195053`), fed by the Mozaik `# inserts /

# rollouts+trays / # pulls / # doors+fronts`counts. Andrew extends the set from`/labour`.

## Cross-feature seams

- Cost codes **extend `labour_operations`** (the registry) — `@features/labour`.
- Subtrade budgets read from **`job_trades.cost`** (ADR 0007) — `@features/partners`.
- The Job Budget-vs-Actual tab mounts on **`/jobs/[id]`** — `@features/jobs`.
- The open-jobs rollup extends **`/pnl`** — `@features/pnl`.

## Known schema wrinkle (read before the FK work)

`jobs.id` is **`text`** (not uuid), so every job FK here is text (matching
`job_trades`). `labour_sessions.job_id` is **also `text`** in the live DB (an
earlier note here said `uuid`; that was stale — verified `text` via PostgREST
2026-06-23 during P4), so it joins to `jobs.id` directly and P4's labour-actuals
read needs no cast. (`labour_sessions.operation_id` is `uuid` = `job_cost_budgets.code_id`.)

## Non-goals (carried from the spec)

No QuickBooks sync yet (model is shaped for it, ADR 0010) · no PO/invoice import
(actuals logged manually) · no estimator pricing rewrite (the codes panel is an
additive budget breakdown) · no per-employee breakdown yet (the `worker_id` seam
exists). No Anthropic API spend — pure CRUD + analytics.
