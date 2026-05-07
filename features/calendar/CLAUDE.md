# Calendar

Month grid of installs, color-coded by job health.

## What it does

Single page (`/calendar`) showing a standard month view (Sun–Sat
columns). Each day cell shows up to ~3 jobs scheduled to install that
day, each with:

- A coloured dot (`HEALTH_DOT`) reflecting health status
  (`on_track | at_risk | blocked | complete | paused`)
- The client name and short job code
- The dollar amount (margin) when space allows

Click a job → links to `/jobs/[id]`. Header has a month-stepper.

This is a **read-only view** — the calendar doesn't create or
reschedule jobs. Editing install dates happens on the job detail page.

## Where things live

- `components/CalendarView.tsx` — the month grid component, takes
  `jobs: Job[]` as props.

The route (`src/app/calendar/page.tsx`) is a thin wrapper that pulls
jobs from `useJobs()` and passes them to `CalendarView`.

## Domain notes

- "Health" is what a designer or installer would call "is this on track?"
  — see `HealthStatus` in `shared/lib/types`. Different from
  `pipelineStatus` (which is about *where* in the pipeline, not whether
  it's late).
- Jobs without an `installDate` are not shown on the calendar. If
  multiple jobs have the same install date, the cell shows "+N more"
  when overflowing.

## When to revisit

- Drag-to-reschedule from the calendar → would need to plumb through
  to jobsStore. Treat as a real feature, plan it.
- Week / agenda view → the current month-only grid is intentional for
  M3; add only if requested.
- Multi-installer assignment colours → revisit when assignment lands
  on the Job model.
