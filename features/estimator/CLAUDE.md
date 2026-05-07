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
- "Save as job" button — creates a draft Job seeded with the line items
  as `CostLine`s and a job-creation activity entry

Default labour rate is `$85/hr` (constant `DEFAULT_LABOUR_RATE` in the
page). The estimator does not persist its own state — once you click
"Save as job," it's a normal Job from then on.

## Where things live

Page logic in `src/app/estimator/page.tsx`. The local `LineItem` type is
the working-row format used only on this page; on save it's flattened to
the canonical `CostLine` schema (`materials | labour | overhead`).

It depends on:
- `useJobs()` — `createJob` to save the result
- `useCatalog()` — material list for the dropdown + price defaults
- `newActivity` from `@features/jobs/lib/activity`

## Domain notes

- Materials cost = sum of (qty × pricePerSqft) for each line.
- Labour cost = sum of (labourHours × labourRate). Note labour is per-line
  so different lines can have different rates (e.g. install vs. shop time).
- Overhead is applied as a % of (materials + labour).
- Margin is applied on top: quoted price = subtotal × (1 + margin%).
  This is **markup**, not margin — see the `computeMargin` helper for the
  inverse calc. Worth keeping consistent terminology when this is touched.

## When to revisit

- Per-cabinet templates (a saved "10ft kitchen kit") → templates would
  belong in features/estimator/lib/.
- Labour rate as a workspace setting instead of a constant → move
  `DEFAULT_LABOUR_RATE` to settings store.
- PDF quote export (separate from invoice) → reuse the invoice rendering
  pipeline.
