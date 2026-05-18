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

```
features/pnl/
├── lib/
│   ├── aggregate.ts        PnlStats type + computePnlStats(jobs)
│   └── chartTokens.ts      CHART_TOKENS for Recharts SVG fills
└── components/
    ├── PnlView.tsx         top-level: header + tiles + chart
    ├── StatsTiles.tsx      the 4 KPI tiles (revenue/cost/margin/avg)
    ├── MarginChart.tsx     Recharts bar chart for the monthly series
    └── Tile.tsx            single tile primitive
```

`src/app/pnl/page.tsx` is a 4-line shell.

Depends on:
- `useJobs()` — single source of revenue/cost truth
- `computeMargin` from `@shared/lib/types`
- `recharts` for the bar chart

`CHART_TOKENS` are hardcoded SVG-safe hex values that match the brand
palette in `tailwind.config.ts`. Recharts can't read CSS variables, so
this duplication is intentional — update both when the palette changes.

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
