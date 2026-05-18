# Settings

Workspace-level controls — branding, tax, storage backend, and dev tools.

## What it does

Single page (`/settings`) with three sections:

1. **Storage** — shows whether persistence is local or Supabase, surfaces
   any current storage error, and offers `Refresh` (re-fetch from backend)
   and `Reset to seed` (wipe back to demo data).
2. **Database seeding** — a one-shot button that pushes the current job
   list to Supabase (used during initial setup).
3. **Tax & company** — read-only display of `COMPANY` and `TAX_RATE`
   constants (currently from `lib/invoice`; see "When to revisit").

## Where things live

```
features/settings/
└── components/
    ├── SettingsView.tsx     top-level page wrapper
    ├── Section.tsx          shared Section + Field primitives
    ├── ErrorBanner.tsx      storage-error banner
    ├── StorageSection.tsx   backend status + seed/refresh buttons
    ├── CompanySection.tsx   read-only company info
    ├── TaxSection.tsx       read-only tax info
    └── ResetSection.tsx     destructive "reset to seed" action
```

`src/app/settings/page.tsx` is a 4-line shell. No feature-specific lib
code yet — sections pull from other features' stores.

Depends on:
- `useJobs()` — for the seed/refresh actions and storage diagnostics
- `COMPANY` and `TAX_RATE` from `@features/jobs/lib/invoice`

## Domain notes

- BC sales tax rate is 12% (5% GST + 7% PST). If that ever changes for a
  client outside BC, this becomes per-job, not per-workspace.
- "Reset to seed" is destructive but has a confirm step. Safe to expose
  to any signed-in user during M1 because there's only one user. If
  multi-user lands, gate this behind a role check.

## When to revisit

- Workspace branding becomes editable (logo upload, colour overrides) →
  move `COMPANY` constant out of `lib/invoice` into a real settings store.
- Multiple workspaces or roles → settings becomes per-workspace, gate
  destructive actions.
