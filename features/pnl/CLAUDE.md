# P&L

Profit-and-loss summary derived from completed and in-progress jobs.

## What it does

Single page (`/pnl`) with:

- Three KPI tiles: lifetime revenue, lifetime cost, lifetime margin (with
  margin % below)
- Month-by-month bar chart (Recharts) showing revenue vs. cost per month,
  with margin trend overlaid

All numbers come from `useJobs()` — there is no separate P&L store. A job
contributes to a month based on its `installDate` (or estimated install
date if not yet installed).

## Where things live

Page logic and charts in `src/app/pnl/page.tsx`. Inline brand tokens
(`TOKEN` constant) are hardcoded here for chart styling — these come from
the Build Direction Spec PDF §3 and should match `tailwind.config.ts`.

It depends on:
- `useJobs()` — single source of revenue/cost truth
- `computeMargin` from `@shared/lib/types`
- `recharts` for the bar chart

## Domain notes

- "Margin" = revenue − cost. Margin % = margin / revenue.
- Cost lines are `materials | labour | overhead` (see `CostLine` in
  `shared/lib/types`). The chart sums all three.
- Jobs without an `installDate` are excluded from the month chart but
  included in lifetime totals.

## When to revisit

- Cash-basis vs. accrual reporting needed → installDate is a proxy for
  recognised revenue; a real cash-basis view would need invoice-paid
  dates from Stripe/QuickBooks.
- More than one fiscal year of data → consider a year selector.
