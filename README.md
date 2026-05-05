# Good Woods Dashboard

Desktop web app for the Good Woods cabinetry business — pipeline, pricing, and margins in one quiet place.

## Status: M1 — Jobs slice (target 2026-06-03)

What ships in M1:

- AppShell with collapsible sidebar (Pipeline active; Calendar / Reports / Catalog / Settings stubbed for M2)
- **Jobs list** at `/` — search, filter by pipeline status, live blended GM% header
- **Job detail** at `/jobs/[id]` — pipeline + health pills, milestones strip (Sold → Materials → Cut → Assemble → Finish → Install), tab scaffold (Overview / Tasks / Files / Costs)
- **Costs tab** — editable revenue + materials/labour/overhead lines, live margin readout color-coded against bands (≥30% healthy · 20–30% tight · <20% below floor)
- **Invoice PDF export** — branded react-pdf template with BC GST+PST 12% tax, downloads as `INV-XXX_<client>.pdf`
- 6 seed jobs covering all four templates (refacing, spray-finishing, install-only, full-project) and all health bands

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS with locked tokens from Build Direction Spec §3
- Lucide icons
- @react-pdf/renderer for invoices
- No DB / no auth in M1 — Supabase wire-up arrives in M2

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Jobs list (default landing) |
| `/jobs/[id]` | Job detail with Costs tab + invoice export |

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build, prerenders all 6 job pages
npm run lint
```

## Design tokens

All visual tokens live in `src/app/globals.css` (CSS variables) and `tailwind.config.ts` (Tailwind aliases).
**Do not invent new tokens** — these are the canonical Good Woods brand. See plan §6 / Spec §3.

## Out of scope for M1

CRM · Estimator · Lean Task Tracker · SOPs · Installer Portal · Inventory · Full P&L · Andon · Multi-role auth · Mobile / TV layouts · Cmd+K · Gantt · Folders · drag-and-drop Kanban (M2).
