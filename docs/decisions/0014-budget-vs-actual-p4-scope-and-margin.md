# 14. Budget-vs-Actual (P4 / Slice D): scope, structure, and margin semantics

Date: 2026-06-23
Status: Accepted

## Context

P4 is the capstone of the cost-codes stack (A live registry → B timer→actuals →
C phase-tagged subtrades → D the Budget-vs-Actual tab). Slices A and B shipped;
C has not. We want the budget-vs-actual answer ("is this job making money,
mid-job?") now, without waiting for C. A grill-with-docs session (2026-06-23)
plus a codebase/DB spike reshaped the design:

- **Spike findings.** `job_cost_budgets` holds **labour rows only** (materials
  and subtrades are deliberately not in it — `saveBudget.ts`). Material budget is
  the job's single job-level figure (`costLines` materials); subtrade budget is
  live `Σ job_trades.cost`; overhead is `costLines` overhead. The live
  `labour_sessions.job_id` column is **`text`** (the committed CLAUDE.md note
  saying `uuid` is stale), so it joins to `jobs.id` directly and `operation_id`
  matches budget `code_id` — no type seam. All actuals/budget tables are
  currently empty (the dashboard holds only example jobs; no real jobs loaded).

## Decision

1. **Build D now for labour + materials; defer subtrade _actuals_ to Slice C.**
   The headline is labelled **"projected margin (excl. subtrade actuals)"** and
   includes subtrades at their **budget** (`Σ job_trades.cost`). It never shows a
   margin that silently omits subtrade cost.

2. **Structure follows where a budget exists at that grain:**
   - **Labour** — per-phase **and** per-code variance (the rich view; this is
     where shop-floor timer actuals live).
   - **Materials** — **job-level** budget (`costLines` materials) vs job-level
     logged actuals (`job_cost_actuals` material). No per-phase material variance.
   - **Subtrades** — job-level **budget only** (actuals deferred to C).
   - **Overhead** — job-level fixed.

3. **Overhead is a silent constant in the margin, not a variance row.** It is
   subtracted so P4's margin matches the all-in margin shown everywhere else in
   the app (`revenue − costsTotal`), but has no actual to track, so it never
   appears as a row and cancels out of Clawback.

4. **Projected margin is anchored to the job's quoted margin + tracked drift**,
   not recomputed from scratch. `projectedMargin = budgetedMargin − (labour drift
   - material drift)`, where `budgetedMargin = revenue − costsTotal` (the Pipeline
     number). With no actuals, projected == quoted. This keeps P4 consistent with
     the rest of the dashboard and sidesteps any estimator-labour-total vs
     cost-code-row-sum reconciliation mismatch.

5. **Labour actual-$ uses each budget row's frozen snapshot rate**
   (`job_cost_budgets.rate`), so variance is purely time/quantity, never a rate
   mismatch.

6. **Data source is estimator-only, accepted for v1.** P4 lights up for jobs
   created via the estimator's _Save as Job_ (which writes `job_cost_budgets`);
   budget-less jobs show an empty state pointing to the estimator. No backfill.

## Consequences

- Per-phase labour variance + a job-level "Other costs" panel (Materials,
  Subtrades budget-only, Overhead) + the anchored-margin/Clawback header. Views:
  Timeline (E, default), Phase bars (B), Pace+margin (C). "Log actual cost"
  records a material `job_cost_actuals` row.
- Subtrade actuals + per-phase subtrade variance arrive with Slice C (which adds
  `job_trades.phase_id` + schedule dates — likely an ADR 0007 amendment); the
  header label drops then.
- Burn-up (A) + Projection (D) views and the `/pnl` open-jobs rollup are P5; the
  learning loop is P6 (unchanged).
- The stale `labour_sessions.job_id uuid` note in
  `features/job-costing/CLAUDE.md` is corrected to `text`.

## Alternatives considered

- **Slice C first, so subtrades are in v1.** Rejected: delays the payoff for the
  smaller, schema-heavier slice; labour (the big variable cost, actuals already
  flowing) + materials deliver the answer now.
- **Recompute projected cost purely from budgets (§8 literal).** Rejected in
  favour of anchor-to-quote + drift, which guarantees P4's margin matches the
  Pipeline and avoids the labour-total reconciliation trap.
- **Drop overhead (show contribution margin).** Rejected: would make P4's margin
  disagree with every other margin in the app for the same job.
