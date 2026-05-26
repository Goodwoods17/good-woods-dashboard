# Projects

The full-archive lookup view at `/projects`. Reads from the same jobs
store that powers Pipeline; the difference is scope and lens:

- **Pipeline (`/`)** — current/active work, the morning-coffee
  dashboard. Filters out `complete`. Hitlist + Schedule + List +
  Kanban views.
- **Projects (`/projects`)** — searchable archive of EVERY project
  ever, including complete + archived. The reference lookup tool.
  Single dense table view with search + status filter chips +
  sortable columns.

Click any project row in either surface and you land on
`/jobs/[id]` — same detail page.

## Where things live

```
features/projects/
├── CLAUDE.md
└── components/
    └── ProjectsView.tsx       (the /projects page renderer)
```

`src/app/projects/page.tsx` is a one-line wrapper around `ProjectsView`.

## Domain notes

- **Naming:** user-facing terminology is "Project" (matches Andrew's
  speech + QuickBooks UI). Internal code keeps `Job` / `features/jobs/`
  / `JOBS_TABLE` / `/jobs/[id]` URL — same entity under two names; the
  rename is user-facing only because the internal name has no effect on
  the eventual QB integration mapping.
- **Payer resolution:** the table column reads contacts via
  `useContacts()` and resolves `job.payerId` → contact name. Falls back
  to the legacy `job.client` text column if `payerId` is missing
  (covers SEED_JOBS localStorage scaffolding and any pre-migration
  rows that slipped through).
- **No new persistence:** all reads go through the existing
  `JobsProvider`. Nothing here writes.
- **Filter chips:** All / Active / Complete + per-stage shortcuts.
  "Active" excludes `complete`; "Complete" shows only `complete`.
  Per-stage chips show that stage only.
- **Sort:** install date desc by default (most recent installs at
  top). Code + Revenue columns also sortable.

## When to revisit

- **Archived filter chip** when `is_archived` lands on jobs. Today,
  archive lives on contacts, not jobs.
- **Year filter** if Andrew wants "all of 2025" quickly. For now
  search "GW-2025" achieves this in code-prefix matching.
- **Export to CSV** for accounting hand-offs. Plan after QB
  integration decision.
- **Multi-select bulk actions** (archive, status change) when scale
  justifies it.

## What this feature does NOT own

- The Pipeline homepage at `/` and its 4 views (Hitlist, Schedule,
  List, Kanban) — those live in `features/jobs/components/`.
- Project creation + detail + edit — `features/jobs/` and `src/app/jobs/`.
- Cross-feature primitives (`StatusBadge`, `MarginCell`, `PageHeader`)
  — `shared/components/`.
