# Job Costing (Cost Codes & Live Budget-vs-Actual)

Estimate-vs-actual job costing: cost codes (labour operations under the 6
phases) flow **estimate → job budget → live actuals → P&L rollup**, with a
learning loop feeding historical averages back into bids. The point is to know
*mid-job* whether a job is making money, in time to act this shift.

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
- **P2–P6** — registry/templates in `/labour`, estimator panel, the
  Budget-vs-Actual tab, `/pnl` rollup, the learning loop. See spec §10.

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
    ├── costCodes.ts   CANONICAL_COST_CODES (the unified-template catalog),
    │                  phase labels/order, rateForPhase — mirrors the seed
    ├── budget.ts      deriveCostCodeBudget (counts → budget rows) +
    │                  reconcileBudgetVsQuote. Pure; tested by
    │                  scripts/test-job-costing-budget.ts
    └── saveBudget.ts  saveJobBudget: writes job_estimates + job_cost_budgets
                       (labour rows) at Save-as-Job
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

## Cross-feature seams

- Cost codes **extend `labour_operations`** (the registry) — `@features/labour`.
- Subtrade budgets read from **`job_trades.cost`** (ADR 0007) — `@features/partners`.
- The Job Budget-vs-Actual tab mounts on **`/jobs/[id]`** — `@features/jobs`.
- The open-jobs rollup extends **`/pnl`** — `@features/pnl`.

## Known schema wrinkle (read before the FK work)

`jobs.id` is **`text`** (not uuid), so every job FK here is text (matching
`job_trades`). The existing `labour_sessions.job_id` is **`uuid`** — upgrading it
to a real nullable FK (spec §4.7) needs a `uuid → text` conversion on existing
data first, in its own tested migration. Deferred from P1; do it with care.

## Non-goals (carried from the spec)

No QuickBooks sync yet (model is shaped for it, ADR 0010) · no PO/invoice import
(actuals logged manually) · no estimator pricing rewrite (the codes panel is an
additive budget breakdown) · no per-employee breakdown yet (the `worker_id` seam
exists). No Anthropic API spend — pure CRUD + analytics.
