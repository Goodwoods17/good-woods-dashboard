# Good Woods Dashboard

Desktop web app for the Good Woods cabinetry business — pipeline, pricing, and margins in one quiet place.

## Status

- **M1 — Jobs slice** (target 2026-06-03) ✅ shipped
- **M2 — Pipeline Kanban + Activity log + Reports** (target 2026-07-03) 🚧 partial — built ahead of schedule, pending Supabase

## What ships today

### Jobs surface
- AppShell with sidebar (Pipeline / Calendar / Reports / Settings active; Catalog stubbed)
- **Cmd+K command palette** — jump to any job by name/code/client or any page
- **Jobs list** at `/` — search, filter by pipeline status, blended GM% header
- **Pipeline Kanban** — drag a card between lifecycle columns to advance stage; persists to localStorage and writes to activity log
- **Job detail** at `/jobs/[id]` — pipeline + health pills, milestones strip (Sold → Materials → Cut → Assemble → Finish → Install)
- **Tabs:** Overview · Costs · Activity (Tasks / Files arrive in M3)
- **Calendar** at `/calendar` — month grid plotting install dates, color-coded by health, with month navigation and a "this month" install list

### Margin engine
- **Costs tab** — editable revenue + materials/labour/overhead lines
- Live margin readout color-coded against bands (≥30% healthy · 20–30% tight · <20% below floor)
- Edits coalesce into activity-log entries via 1.5s debounce

### Invoicing
- **Invoice PDF export** — branded react-pdf template with BC GST+PST 12% tax
- Downloads as `INV-XXX_<client>.pdf`

### Reports
- `/reports` — trailing GM% across closed jobs, pipeline value by stage (bar chart), margin-sorted job table

### Persistence
- localStorage (`gw_jobs_v1`) — survives refresh, satisfies the "resume after 3 days" objective
- Reset to seed jobs from Settings

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS with locked tokens from Build Direction Spec §3
- Lucide icons
- @dnd-kit for accessible drag-and-drop
- Recharts for reports
- @react-pdf/renderer for invoices

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Jobs (List ↔ Kanban toggle) |
| `/jobs/[id]` | Job detail · Overview · Costs · Activity tabs |
| `/calendar` | Install schedule month grid + this-month list |
| `/reports` | Trailing GM, pipeline value, margin by job |
| `/settings` | Company info, tax rate, local-data reset |

Press **⌘K** (or **Ctrl+K**) anywhere to jump.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

## Design tokens

All visual tokens live in `src/app/globals.css` (CSS variables) and `tailwind.config.ts` (Tailwind aliases).
**Do not invent new tokens** — these are the canonical Good Woods brand. See plan §6 / Spec §3.

## What's still on the shelf

CRM · Estimator · Lean Task Tracker · SOPs · Installer Portal · Inventory · Full P&L · Andon · Multi-role auth · Mobile / TV layouts · Gantt · Folders · Catalog · Supabase wire-up.

The Supabase migration is the next step that needs auth setup — see the M2 plan in memory.
