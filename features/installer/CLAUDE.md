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

```
features/installer/
├── lib/
│   └── buckets.ts          InstallBucket type + bucket() +
│                           groupByInstallBucket() pure functions
└── components/
    ├── InstallerView.tsx   top-level: 4 InstallGroup sections
    ├── InstallGroup.tsx    one bucket (Today / This week / Later / Past)
    └── InstallCard.tsx     individual job card with Maps + Done button
```

`src/app/installer/page.tsx` is a 4-line shell.

Depends on `useJobs()` for install dates + "mark complete," and
`formatDate` from `@shared/lib/format`.

## Domain notes

- "Past due" includes jobs whose installDate is in the past but
  `pipelineStatus !== "complete"`. Once marked complete, the job leaves
  this view entirely.
- The click-to-Maps URL prefers `job.siteAccess.installAddress` (the
  install-specific address from the SiteAccess shape), falls back to
  `job.address`, then to the client name as a search query.
- **Site & access strip** (added 2026-05-25): InstallCard renders a
  compact pill row from `job.siteAccess`, conditional per field. Pet
  pill (clay-soft) only if `pet.type` is set. Code chips (mono, dense)
  only for populated codes. Parking pill truncates with a `title` for
  full text. Site-contact pill is a `tel:` link. Demo + elevator are
  status flags. When `siteAccess` is empty `{}`, the strip doesn't
  render — keeps simple jobs visually quiet.
- The strip's full editor lives in `features/jobs/components/
  SiteAccessForm.tsx` (used by OverviewTab + /jobs/new). The InstallCard
  only READS — installers don't edit site/access from the truck.

## When to revisit

- Offline support (truck has spotty signal) → service worker + cached job
  list. M1 punted this; revisit when an installer complains.
- Photo capture / sign-off → need a place to store images; coordinate with
  Supabase Storage when that's wired up.
- Multi-installer (more than one truck) → assignment field on jobs, filter
  this view by signed-in user.
