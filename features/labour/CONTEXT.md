# Shop Labour — domain glossary

Precise vocabulary for the labour feature. A glossary, not a spec
(implementation in `CLAUDE.md`).

## Operation

A named unit of shop work that time is logged against — e.g. "Assemble
base cabinet", "Spray finish (per batch)", "Install — uppers". The
granular thing the bottleneck finder ranks. Editable/addable at runtime.

## Category

A rollup bucket an operation belongs to — Design · CNC/Cut · Assembly ·
Finishing · Delivery · Install (the workflow-aligned six, editable). The
**primary axis** the bottleneck view groups by. Mirrors the estimator's
labour-bearing sections so actuals map back to quoted minutes.

## Session

One timed run of an operation: who, what operation/category, optional
job, `started_at`, `ended_at`. `ended_at` null = **running**. The event
log; everything aggregates from sessions. A session's `category_id` is a
**snapshot** taken at start — re-categorising the operation later never
rewrites past history.

## Worker

A member of the editable roster. Each session records the worker, so the
bottleneck data can be split by person.

## Running vs completed

A **running** session has no `ended_at` and shows live elapsed time;
**many** can run at once (parallel stations). A **completed** session has
both timestamps and contributes its duration to averages. Only completed
sessions feed analytics and the estimator nudge.

## Bottleneck

Where shop time concentrates — the operation or category with the most
total time. The feature's primary output: surface the jam, not just the
hours.

## Estimator nudge (auto-suggest)

When an operation tagged to a **cabinet type** has a tracked average that
drifts from the estimator's `catalog_cabinet_types` assembly minutes, the
analytics view suggests updating the default. Andrew **approves** (Apply);
nothing auto-updates. This is the quote → actual → refine loop.

## Not a Catalog item

Labour is **not** in the price-book Catalog. The Catalog answers "what
does it cost to buy/quote?"; labour answers "where does our time go?".
Different question, different data shape (event log of actuals vs a
catalog of rates), different tables. See ADR 0006.
