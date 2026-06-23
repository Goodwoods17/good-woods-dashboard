# Shop floor — work-card board (Slice B)

Real-time shop-floor capture built on the 6-phase job spine.
Replaces the old station-board Kanban (retired Slice A; see "Retired files" below).

## What it does

Single page (`/shop`) that renders `<ShopFloorView />`.

### 6-phase spine

Each job flows through six phases (matching the job costing phases):

1. **Material** — stock sourced, sheet goods cut
2. **Cut** — parts machined to dimension
3. **Assemble** — carcases + face frames glued up
4. **Finish** — paint, stain, or clear coat
5. **Hardware** — pulls, hinges, soft-close fitted
6. **Install** — site delivery + fit-out

### Work cards

A **work card** represents one chunk of work a single worker is executing right now.
Cards are seeded from the job budget (cost-code task templates) and can be added manually.

Each card carries:

- `jobCode` + `phaseId` + `costCode` — links to the job budget line
- `workerId` — who is on it
- `status`: `idle` | `in_progress` | `stuck` | `done`
- `stuckNote` — reason surface when `stuck` (triggers Needs-attention highlight)
- `suggestedMins` — budget minutes from the template (drives the pace timer)
- Timer state (`startedAt`, `pausedAt`, accumulated `elapsedSecs`)

### Per-worker pace timer

The pace timer (built in Slice B / `feat/labour-pace-timer`) lives on each card:

- Start / pause / resume tracks real elapsed time
- Compares elapsed vs `suggestedMins` and colours the pace indicator
  (green = on pace, amber = slightly over, red = blown)
- Pausing the card clears `workerId` (the worker is free for another card)

### Stuck / Needs-attention

When a worker marks a card `stuck` they enter a short note.
Stuck cards render with a red ring and float to the top of their column.
The foreman sees them at a glance and can re-assign or unblock.

### Needs-a-code triage

Cards with no `costCode` yet (manually added or imported without a code)
render with an amber badge. The office assigns a code before the card
is included in job-costing reports.

### External-blocker chips (read-only)

`JobBoard` surfaces the job's active external blockers (from the jobs
feature's `job_blockers` / `useJobBlockers`, ADR 0013): whole-job
blockers as a chip under the job-name header, phase-specific blockers
as a chip on the matching phase column. Read-only here — raise, resolve,
and reopen happen on the Blockers card in `/jobs/[id]`.

### Seeding from the budget

When a job is approved, the estimator's phase-level budget lines become
seed cards via `useWorkCards().seedFromBudget(jobId)`. Workers then pick
up and start cards rather than entering time from scratch.

## Where things live

```
features/shop/
├── lib/
│   └── workCardsStore.tsx   WorkCard type, WorkCardsProvider, useWorkCards
└── components/
    ├── ShopFloorView.tsx    Top-level view — 6-phase column layout
    ├── WorkCardItem.tsx     Individual work card (pace timer, status badge)
    ├── AddCardModal.tsx     Add-card form (imports Modal from @shared/components/ui)
    └── JobBoard.tsx         Per-job card summary view (optional drill-down)
```

`WorkCardsProvider` is mounted in `src/app/layout.tsx`.
The page at `src/app/shop/page.tsx` is a thin shell that renders `<ShopFloorView />`.

## Retired files (dead code — remove in a later cleanup)

The old station-board Andon system from Slice A is no longer imported or referenced.
These files are **dead code** and safe to delete:

- `features/shop/lib/shopStore.tsx` — old `ShopProvider` + `WorkUnit`/`AndonEvent` types
- `features/shop/components/ShopBoard.tsx`
- `features/shop/components/ShopColumn.tsx`
- `features/shop/components/WorkUnitCard.tsx`
- `features/shop/components/NewUnitModal.tsx`
- `features/shop/components/UnitModal.tsx`
- `features/shop/components/AndonBanner.tsx`
- `features/shop/components/AndonModal.tsx`

The `shop_units` and `andon_events` Supabase tables are also unused.
Drop them (with an RLS-aware migration) in the same cleanup.

> Note: `Modal.tsx` is **not** a shop file — it lives at
> `shared/components/ui/Modal.tsx` and is still used by `AddCardModal`.

## Domain notes

- Cards are **job-scoped**: every card must trace to a `jobCode`.
  The link is by code string (not a foreign key) to keep the shop
  board decoupled from the jobs feature at the UI layer.
- `suggestedMins` comes from the labour task-template minutes stored in
  the catalog (`catalog_labour_templates`). If absent, the timer runs
  unbounded (no pace colour).
- The 6-phase spine matches `PHASES` in `features/jobs/lib/jobsStore.tsx`
  exactly — use that constant, never hardcode phase names here.

## When to revisit

- Supabase persistence + realtime push so the foreman's wall tablet
  and workers' phones stay in sync (currently in-memory only).
- Daily time-card roll-up: aggregate elapsed seconds per worker per day
  into a `time_entries` table for payroll export.
- Auto-seed cards when a job moves to "In Progress" status (currently
  triggered manually by the estimator).
