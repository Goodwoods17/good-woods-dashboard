# 15. Subtrade actuals tracked per trade-line (Slice C)

Date: 2026-06-23
Status: Accepted

## Context

ADR 0014 deferred subtrade actuals to "Slice C" and described that slice as
requiring `job_trades.phase_id` + schedule dates (a schema change) and an
amendment to ADR 0007. It also labelled the projected-margin headline
_"(excl. subtrade actuals)"_ until that work landed.

A spike before Slice C revealed that `job_cost_actuals` already had all the
columns needed for per-trade-line subtrade actuals (`kind`, `trade_line_id`,
`partner_id`, `phase_id`, `actual_date`). No schema change was required. The
`job_trades.phase_id` column mentioned in ADR 0014 as a prerequisite turned out
not to be needed for the actuals grain we chose.

## Decision

**Subtrade actuals are tracked per trade-line, with no migration, using the
existing `job_cost_actuals` table.**

1. **No migration.** `job_cost_actuals` already supports `kind = 'subtrade'`,
   `trade_line_id`, `partner_id`, `phase_id`, and `actual_date`. Nothing new
   was added to the schema.

2. **Per-trade-line grain.** Each `job_trades` row (a "trade-line") becomes its
   own budget + actuals row in the Budget-vs-Actual view. The trade-line's
   `cost` column is the budget; `job_cost_actuals` rows whose `trade_line_id`
   matches are its actuals. This is finer than "job-level budget only" and
   matches the existing grain of trade-lines on the project.

3. **Per-line projection mirrors materials.**
   - A trade-line with `status = 'done'` (or pipeline-complete) locks to its
     actual total — no drift past the finish line.
   - An open trade-line (`needed` / `booked`) projects to
     `max(actual, budget)` — an under-budget open line contributes zero drift.
     Overruns persist immediately; savings are withheld until the line closes.

4. **`projectedMargin` is now all-in.**
   `projectedMargin = budgetedMargin − labourDrift − materialDrift − subtradeDrift`
   where `subtradeDrift = Σ projectedCost − Σ budget` across all trade-lines.
   `clawback = max(0, budgetedMargin − projectedMargin)` equals the sum of all
   three drift components. The `"(excl. subtrade actuals)"` caveat label is
   **removed**.

5. **Null `trade_line_id` actuals surface as "Unassigned".** A subtrade actual
   without a matching trade-line is never silently dropped; it appears as a
   synthetic "Unassigned" line in the subtrades table and is included in the
   drift total. (`UNASSIGNED_LINE` sentinel in `budgetVsActual.ts`.)

6. **Logging via the existing "Log actual cost" form.** A Material | Subtrade
   toggle was added to the inline form on the Budget-vs-Actual tab. Selecting
   Subtrade shows a trade-line picker (populated from `job_trades`). The
   `logActual` call writes a `kind = 'subtrade'` row with `trade_line_id` and
   `partner_id`.

7. **ADR 0007 needs no amendment.** No `job_trades.phase_id` column was added;
   no schedule-date columns were added. The trade-line structure in ADR 0007
   is unchanged.

## Supersedes

This ADR supersedes the relevant portion of **ADR 0014** — specifically:
- § Decision 2 ("Subtrades — job-level budget only (actuals deferred to C)")
- § Consequences ("Subtrade actuals … arrive with Slice C (which adds
  `job_trades.phase_id` + schedule dates — likely an ADR 0007 amendment)")
- The `"(excl. subtrade actuals)"` label on the projected-margin headline

ADR 0014 remains authoritative for all other aspects of the Budget-vs-Actual
tab (labour variance, materials variance, margin anchor, overhead treatment,
data source, Clawback definition, empty state).

## Consequences

- **Math is tested by Vitest** (`npm test`). The unit tests in
  `features/job-costing/lib/budgetVsActual.test.ts` cover per-line projection,
  done-lock, open under-budget ($0 drift), multi-line totalling,
  and the Unassigned bucket. (Ported from `scripts/test-budget-vs-actual.ts`
  and extended for subtrades in Slice C.)

- **Smoke fixture updated.** `scripts/seed-bva-smoke.ts [jobId]` seeds a
  Countertop trade-line with an $800 subtrade budget, enabling the DoD
  walk-through against `/jobs/[id] → Budget vs Actual`. Run with `--clean`
  to remove.

- **Name resolution via embed.** The store fetches
  `job_trades.select("*, trades(label), subtrades(name)")` to resolve the
  trade discipline label and the subtrade company name without a separate
  query. This is the working PostgREST select string (FK naming verified on
  the live DB).

- **No new cross-feature seams.** The `job_cost_actuals` table is already
  owned by job-costing; `job_trades` (partners) was already read by P4 for
  the subtrade budget. No new feature-boundary contracts were opened.

## Alternatives considered

- **Add `job_trades.phase_id` and use it for subtrade variance, as ADR 0014
  planned.** Rejected once the spike showed `job_cost_actuals` already had
  `trade_line_id`. Phasing a trade-line at write time (when the actual is
  logged) is simpler and doesn't require a migration that touches the
  partners feature.

- **Keep actuals deferred further; ship only subtrade budget in the Subtrades
  table.** Rejected. ADR 0014 already shipped budget-only; the UX improvement
  of showing actual vs budget per line is the whole point of Slice C, and the
  schema cost turned out to be zero.

- **Silently drop null-`trade_line_id` actuals.** Rejected. A logged actual
  that disappears from the total is a data-integrity hazard. The Unassigned
  bucket makes the drift visible and keeps the headline trustworthy.
