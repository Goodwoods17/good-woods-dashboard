# Installer Portal

Mobile-friendly daily view of upcoming installs, designed for the person
in the truck.

## What it does

Single page (`/installer`) bucketing all jobs with an `installDate` into
four time-windows:

- **Today** — installing today
- **This week** — installing in the next 7 days
- **Later** — installing more than 7 days out
- **Past due** — installDate has passed but job isn't marked complete

Each card shows the client, project, install date, and a click-to-Maps
link if an address is set. There's a "mark complete" action.

Layout is mobile-first (single column, large tap targets) — this is the
one page that actually gets used on a phone.

## Where things live

Page logic in `src/app/installer/page.tsx`. The bucketing helper
(`bucket(job, today)`) is local to the file — small enough not to extract.

It depends on:
- `useJobs()` — install dates and "mark complete" state
- `formatDate` from `@shared/lib/format`

## Domain notes

- "Past due" includes jobs whose installDate is in the past but
  `pipelineStatus !== "complete"`. Once marked complete, the job leaves
  this view entirely.
- The click-to-Maps URL uses `job.address` if present, otherwise just
  the client name as a search query.

## When to revisit

- Offline support (truck has spotty signal) → service worker + cached job
  list. M1 punted this; revisit when an installer complains.
- Photo capture / sign-off → need a place to store images; coordinate with
  Supabase Storage when that's wired up.
- Multi-installer (more than one truck) → assignment field on jobs, filter
  this view by signed-in user.
