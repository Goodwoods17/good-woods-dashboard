# Jobs

The core feature — every other module derives from this one. Jobs are
the source of revenue, cost, margin, schedule, and client relationships.

## What it does

Three routes plus a shared store:

- `/` (Pipeline) — list or Kanban view of every job, with health pills,
  margin cells, and a blended GM% header. Search + status filter on
  top.
- `/jobs/new` — the long-form create flow: client, project, milestones
  template, materials/labour/overhead/margin → quoted price → draft
  invoice. Generates the next sequential job code.
- `/jobs/[id]` — the detail page: clickable milestones strip,
  Overview / Costs / Tasks / Activity tabs, status pills with editors,
  ICS calendar export, delete-with-confirm.

The `JobsProvider` mounted in `src/app/layout.tsx` is the single source
of truth for everything to do with jobs across the app.

## Where things live

```
features/jobs/
├── components/
│   ├── ActivityTab.tsx          (timeline of changes)
│   ├── CostsTab.tsx             (line items + invoice download)
│   ├── JobDetail.tsx            (the [id] page wrapper)
│   ├── JobsList.tsx             (pipeline list view)
│   ├── KanbanBoard.tsx          (pipeline kanban view; @dnd-kit)
│   ├── MilestonesStrip.tsx      (the clickable progress strip)
│   ├── OverviewTab.tsx          (key fields + dates)
│   ├── SiteAccessForm.tsx       (install-day intel editor; shared
│   │                             by /jobs/new collapsible + OverviewTab)
│   ├── TasksTab.tsx             (per-job todo list)
│   ├── ViewToggle.tsx           (list / kanban switcher)
│   └── invoice/
│       └── InvoiceDocument.tsx  (react-pdf invoice renderer)
└── lib/
    ├── activity.ts              (diffActivity + newActivity helpers)
    ├── ics.ts                   (calendar export — uses invoice getCompany())
    ├── invoice.ts               (company/tax identity via getCompany()/getTaxRate(), set at runtime by workspace settings; computeInvoiceTotals, generateInvoicePdf)
    ├── jobs.ts                  (SEED_JOBS, getJob, etc.)
    ├── jobsRowMap.ts            (Supabase row ↔ Job conversion; internal to jobsStore)
    └── jobsStore.tsx            (JobsProvider, useJobs, useJob)
```

## Domain notes

- **Job code** is human-facing (`GW-2026-001`, `GW-2026-002`). Generated
  sequentially by `nextJobCode`, defined inline in
  `src/app/jobs/new/page.tsx`. Job rows in Supabase use a UUID `id`
  separately.
- **Pipeline status** vs. **health status** are independent: pipeline
  is "where it is in the funnel" (`new → sold → in_design → ...`),
  health is "is this on track" (`on_track | at_risk | blocked | ...`).
  See `shared/lib/types`.
- **Cost lines** (`materials | labour | overhead`) sum into total cost.
  Margin = revenue − cost. Margin % = margin / revenue.
- **Activity** (timeline) is generated automatically by `diffActivity`
  whenever a job is updated — comparing prev/next snapshots. Manual
  entries via `newActivity`.
- **Persistence** is dual-mode like Catalog: Supabase when env present,
  localStorage (`gw_jobs_v1`) otherwise. Errors surface via `formatError`
  so we never see `[object Object]` again (see git log for context).
- **Invoice PDF** uses `@react-pdf/renderer` with a dynamic import in
  `lib/invoice.ts` so the renderer chunk stays out of the main bundle.
  BC GST+PST = 12% is the default tax rate; the live rate comes from
  workspace settings via `getTaxRate()` (editable in /settings).
- **ICS export** generates an all-day install event from the job's
  `installDate` and includes the client + COMPANY in the description.
- **Site & access** (added 2026-05-25): `job.siteAccess` is a jsonb
  shape on the `public.jobs` row (migration
  `20260525_jobs_site_access.sql`). Holds install-day intel for the
  crew: install address (if different from billing), buzzer/door/
  lockbox codes, parking notes, building access notes, elevator booking
  flag + window, pet info (type + name + note), on-site backup contact
  (name + phone + role), best contact window, demo-required flag,
  existing-space photos URL. The shape is defined in
  `shared/lib/types.ts` as `SiteAccess` and lives entirely in TS — no
  schema enforcement inside the jsonb. Edited via `SiteAccessForm`
  from both `/jobs/new` (collapsible card, default closed) and the
  OverviewTab (always-visible card, save-on-blur with 1.2s debounce).
  Surfaced read-only on the InstallCard pill strip.

## When to revisit

- **QuickBooks two-way sync** — would replace `lib/invoice.ts`'s
  in-app PDF with sending invoices through QB. Plan as M3-Q.
- **Per-cabinet line items** — currently `CostLine`s are flat; revisit
  if the estimator grows beyond rough kitchen-sized totals.
- **Multi-installer assignment** — add `installerId` to Job and surface
  on `/installer`. Coordinate with auth feature for the user list.
- **Job archiving** — currently complete jobs stay in the list. If the
  list grows past 100, add an archive view + pipeline filter.

## What this feature does NOT own

- Cross-feature UI primitives (`HealthPill`, `MarginCell`,
  `StatusBadge`, `StatusEditor`) → `shared/components/ui/`
- Auth and the signed-in user → `shared/lib/authStore` and
  `features/auth/CLAUDE.md`
- The Catalog (materials/finishes the Estimator pulls from) →
  `features/catalog/`
- Shop-floor work units → `features/shop/`
