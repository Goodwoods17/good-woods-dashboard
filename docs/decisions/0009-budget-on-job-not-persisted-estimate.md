# 0009. Live job costing stores the budget on the job, not a persisted estimate

Date: 2026-06-20

## Status

**Accepted.** Architecture decision for the cost-codes / live job-costing feature
(spec: `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md`).
Chosen in a brainstorming + `/grill-with-docs` session (2026-06-20). Builds on
ADR 0006 (labour ≠ catalog) and ADR 0007 (`job_trades.cost` as the future P&L
tie-in), and depends on ADR 0008 (milestones = phases).

## Context

The estimator prices a quote but does **not** persist it — on _Save as Job_ it
collapses labour into flat `materials/labour/overhead` `CostLine`s, and re-opening
`/estimator` is a blank slate. (The estimator's own CLAUDE.md/PLAN already list
"draft-estimate persistence" as a future candidate.) The new feature needs a
**budget baseline** — budgeted minutes/$ per cost code — to compare live actuals
against, per job, while the job is open.

Two ways to get that baseline:

- **Persist the whole estimate** as first-class rows (codify the estimator's
  labour sections, link Job → estimate, track actuals against the estimate's
  codes).
- **Write only the resulting per-code budget onto the job** at save time, leaving
  the estimator's in-memory model alone.

## Decision

**The budget is authored in the estimate but stored on the job.** At _Save as
Job_, the estimator writes `job_cost_budgets` (per labour code: minutes, rate, $;
plus a material budget per phase) alongside the normal `CostLine`s. The estimate
itself stays un-persisted in-memory state; there is no estimate table.

1. The estimator's **pricing math is untouched** — a new "Labour cost codes" panel
   is an additive budget breakdown that **reconciles to** (does not replace) the
   quoted labour total.
2. Actuals accrue against the job's frozen budget: labour from `labour_sessions`,
   material/subtrade from `job_cost_actuals`, subtrade budget from
   `job_trades.cost`.
3. The budget is **editable on the job** after save — it is the job's baseline,
   not the estimate's.

## Alternatives considered

- **Persist the whole estimate as the budget (Approach B).** Architecturally
  purest — one budget source of truth, re-openable estimates. Rejected for v1: it
  drags in the entire long-deferred estimate-persistence project and reworks the
  estimator's labour sections — a far larger blast radius, and slower to the first
  live timeline. Not precluded later: storing the budget on the job does not block
  building estimate persistence afterward.
- **Phase-level budget only, no per-code (Approach C).** Rejected — under-delivers
  the explicit per-operation-code + templates + per-code history ask. Folded into
  the rollout as the early phase, not the destination.

## Consequences

- **Additive schema, no estimator rewrite.** New `cost_code_templates`(+items),
  `job_cost_budgets`, `job_cost_actuals`; a `code` column on `labour_operations`;
  `labour_sessions.job_id` upgraded to a nullable FK (the link now carries cost).
- **Two budget homes to keep honest:** the coded labour breakdown must reconcile
  to the quote's labour subtotal — surfaced as a non-blocking drift warning, not
  enforced.
- **Re-opening an estimate is still a blank slate** (unchanged); the job, not the
  estimate, is the durable record. If draft-estimate persistence is built later,
  it can supersede the save-time write without disturbing the actuals model.
- Realizes ADR 0007 §9's "future P&L tie-in" and extends ADR 0006's labour/catalog
  split with a new costing seam that lives in neither feature.
