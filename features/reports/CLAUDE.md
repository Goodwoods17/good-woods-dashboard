# Reports

Margin and pipeline performance views — for the "are we making money?"
question.

## What it does

Single page (`/reports`) with three sections:

1. **Trailing GM%** (gross margin %) — KPI tile + sparkline of the last
   N completed jobs.
2. **Pipeline value bar** — stacked horizontal bar showing the total
   quoted value across pipeline stages (`new → sold → in_design → ...
   → complete`), so you can see where the money currently sits.
3. **Margin-sorted job table** — every job, sorted by margin %
   descending, with a `MarginCell` colour cue (red/amber/green based on
   threshold) and a `HealthPill` next to the status.

Pure read view — derived from `useJobs()`, no separate store.

## Where things live

- `components/ReportsView.tsx` — the entire visualisation, takes
  `jobs: Job[]` as props.

The route (`src/app/reports/page.tsx`) is a thin wrapper that pulls
jobs from `useJobs()` and renders `<ReportsView />`.

## Domain notes

- "GM%" (gross margin %) = (revenue − cost) / revenue, computed via
  `computeMargin` in `shared/lib/types`.
- The colour thresholds in `MarginCell` (red < X%, amber < Y%, green ≥ Y%)
  are domain decisions that should live with whatever defines "good
  margin for cabinetry" — currently defined inside `MarginCell` itself.
- Brand `TOKEN` constants are inlined for chart styling because Recharts
  can't read CSS vars. Keep these in sync with `tailwind.config.ts`.

## When to revisit

- Date-range filter (last 30/90 days, this quarter) → currently lifetime
  only; add when there's enough history to make ranges interesting.
- Per-client or per-designer breakdowns → reuse the CRM-style derivation
  but pivot on `client` / `designer`.
- Export to CSV/PDF → wrap the underlying data hook so multiple views
  can consume it.
