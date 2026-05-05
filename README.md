# Good Woods Dashboard

Desktop web app for the Good Woods cabinetry business — pipeline, pricing, margins, shop floor, installs, and the books.

**Live:** https://good-woods-dashboard.vercel.app

## Status

Built ahead of schedule the night of 2026-05-04 → 2026-05-05.

| Module | Plan target | Status |
|---|---|---|
| **M1** Jobs slice | 2026-06-03 | ✅ Live |
| **M2** Kanban + Activity + Reports + Persistence | 2026-07-03 | ✅ Live (Supabase) |
| **M3** Estimator + Catalog + Cmd+K + Calendar | 2026-08-03 | ✅ Live |
| **M4** SOPs library | 2026-09-03 | ✅ Live |
| **M5** Lean Tracker (shop floor) + Andon | later | ✅ Live |
| **M6** Installer Portal (mobile) | later | ✅ Live |
| **M7** CRM + Inventory + P&L | later | ✅ Live |

## Modules

### Sell & Plan
- `/` **Pipeline** — list ↔ Kanban, search, status filter, blended GM% header
- `/jobs/new` **New Job** — full form, generates next code, creates draft invoice
- `/jobs/[id]` **Job Detail** — milestones strip (clickable), Overview · Costs · Tasks · Activity tabs, status pills with editors, ICS calendar export, delete-with-confirm
- `/estimator` **Estimator** — line items, materials/labour/overhead/margin → quoted price, "Save as Job"
- `/calendar` **Calendar** — month grid of installs, color-coded by health
- `/crm` **Clients** — derived from jobs, lifetime revenue/margin per client

### Build
- `/shop` **Shop floor** — drag-and-drop Kanban for work units (Cut → Assemble → Finish → Install) with WIP limits, Andon button + active issues banner
- `/sops` **SOPs library** — 5 cabinet shop SOPs (cut list, drawer box, spray booth, install pre-flight, invoicing)
- `/installer` **Installer Portal** — mobile-friendly daily view: Today / This week / Coming up / Past due, click-to-Maps, mark complete

### Stock & Money
- `/catalog` **Catalog** — Materials + Finishes editable tables (8 seed materials, 4 finishes)
- `/inventory` **Inventory** — quantity on hand, reorder points, low-stock banner
- `/reports` **Reports** — trailing GM%, pipeline value bar, margin-sorted job table
- `/pnl` **P&L** — lifetime revenue/cost/margin tiles + month-by-month bar chart

### Cross-cutting
- **⌘K palette** — keyboard nav across every page and every job by name/code/client
- **Cross-device sync** — Supabase Postgres backend (Canada Central)
- **Branded invoice PDF** — react-pdf, BC GST+PST 12%, clay accent

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS with locked tokens from Build Direction Spec §3
- Lucide icons
- @dnd-kit for accessible drag-and-drop
- Recharts for reports / P&L
- @react-pdf/renderer for invoices
- @supabase/supabase-js for cloud persistence
- Vercel hosting (auto-deploy from GitHub `main`)

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

`.env.local` (gitignored) holds Supabase credentials. Without it the app falls back to localStorage so you can fork-and-run with no setup.

## Design tokens

All visual tokens live in `src/app/globals.css` (CSS variables) and `tailwind.config.ts`.
**Locked decision L2** — these are the canonical Good Woods brand. Do not invent new tokens.

## What's still on the shelf

- TV display mode (Spec §12)
- Multi-role auth (Supabase Auth wire-up needed)
- QuickBooks + Google Calendar two-way sync (M3 Q-Integrations)
- Mobile voice-measure backend share (`cabinet-app-spec.md` v1.3)
- Custom domain (`app.goodwoods.ca`)

These need either a setup gate (auth, external accounts) or live data flowing first.
