# Estimator

Build a quote from line items, materials, labour, overhead, and margin →
turn it into a draft job.

## What it does

Single page (`/estimator`) with:

- Header fields: client name, project name, overhead %, margin %
- A table of line items, each with: description, qty, material (picked
  from Catalog), material price/sqft (auto-filled, editable), labour
  hours, labour rate
- Live totals: materials cost, labour cost, overhead, margin → quoted
  price
- "Save as Job" button — creates a draft Job seeded with the line items
  as `CostLine`s and a job-creation activity entry

Default labour rate is `$85/hr` (`DEFAULT_LABOUR_RATE` in
`lib/types.ts`). The estimator does not persist its own state — once
you click "Save as Job," it's a normal Job from then on.

## Where things live

```
features/estimator/
├── lib/
│   ├── types.ts                LineItem + DEFAULT_LABOUR_RATE
│   ├── totals.ts               computeTotals — pure pricing math
│   └── createJobFromEstimate.ts  builds a Job spec from estimator state
└── components/
    ├── EstimatorView.tsx       top-level: state + handlers + layout
    ├── ProjectSection.tsx      Client + Project fields
    ├── LineItemsTable.tsx      Lines list header + Add button
    ├── LineItemRow.tsx         Single editable row
    ├── MarkupSection.tsx       Overhead % + Margin %
    ├── QuoteSummary.tsx        Sidebar summary + Save button
    └── inputs.tsx              FieldInput / NumberInput / Sub / SummaryRow
```

`src/app/estimator/page.tsx` is a 4-line shell that renders
`<EstimatorView />`.

Depends on:

- `useJobs()` — `createJob` to save the result, `jobs` for next-code
- `useCatalog()` — material list for the dropdown + price defaults
- `newActivity` from `@features/jobs/lib/activity`

## Domain notes

- Materials cost = sum of (qty × pricePerSqft) for each line.
- Labour cost = sum of (labourHours × labourRate). Labour is per-line so
  different lines can have different rates (e.g. install vs. shop time).
- **Markup is per-line.** Each line item has its own `markupPct`. The
  "Default markup %" in the Defaults section seeds new lines — it does
  not retroactively update existing rows. Formula:
  `linePrice = lineDirect × (1 + markupPct/100)`.
- Overhead is applied as a % of total direct cost (materials + labour),
  added to the quoted price after per-line markups.
- **Markup is on cost, margin is on price.** Don't confuse them. A 35%
  markup on $1,000 cost = $1,350. A 35% margin would be $1,538. The
  effective margin% shown in the Quote summary is computed back from
  the final numbers so the cabinetmaker mental model (markup) and the
  P&L mental model (margin) line up.

## When to revisit

- Per-cabinet templates (a saved "10ft kitchen kit") → templates would
  belong in `features/estimator/lib/templates.ts`.
- Labour rate as a workspace setting instead of a constant → move
  `DEFAULT_LABOUR_RATE` to settings store.
- PDF quote export (separate from invoice) → reuse the invoice
  rendering pipeline.
