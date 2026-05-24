# Good Woods Dashboard

Desktop web app for the Good Woods cabinetry business — pipeline,
pricing, margins, shop floor, installs, and the books.

**Live:** https://good-woods-dashboard.vercel.app

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase · Vercel.
See [`docs/decisions/0004-nextjs-not-plain-html.md`](docs/decisions/0004-nextjs-not-plain-html.md)
for why.

## Structure

```
src/app/            Next.js routes — page.tsx files only, thin wrappers
features/<name>/    Per-feature code (components, lib, CLAUDE.md spec)
shared/             Cross-feature code (layout, ui, lib helpers, auth)
data/               Local JSON fixtures
docs/               Domain glossary, ADRs, roadmap
```

Path aliases: `@/*` → `src/*` · `@features/*` → `features/*` ·
`@shared/*` → `shared/*`.

## Features

Each feature has a `CLAUDE.md` spec. Read it before changing the
feature's behaviour.

**Sell & Plan**
- [`jobs`](features/jobs/CLAUDE.md) — pipeline, new-job flow, job
  detail. The core domain.
- [`estimator`](features/estimator/CLAUDE.md) — line items →
  quote → draft job
- [`calendar`](features/calendar/CLAUDE.md) — month grid of installs
- [`crm`](features/crm/CLAUDE.md) — clients derived from jobs

**Build**
- [`shop`](features/shop/CLAUDE.md) — drag-and-drop Kanban with WIP
  + Andon
- [`sops`](features/sops/CLAUDE.md) — Standard Operating Procedures
- [`installer`](features/installer/CLAUDE.md) — mobile install view

**Stock & Money**
- [`catalog`](features/catalog/CLAUDE.md) — materials & finishes
- [`inventory`](features/inventory/CLAUDE.md) — stock-on-hand
- [`reports`](features/reports/CLAUDE.md) — margin + pipeline value
- [`pnl`](features/pnl/CLAUDE.md) — month-by-month P&L

**Cross-cutting**
- [`auth`](features/auth/CLAUDE.md) — login flow (auth machinery
  itself lives in `shared/lib/authStore.tsx`)
- [`settings`](features/settings/CLAUDE.md) — workspace controls

## Status

Built ahead of schedule the night of 2026-05-04 → 2026-05-05.
Restructured into feature folders 2026-05-07.

| Module | Plan target | Status |
|---|---|---|
| **M1** Jobs slice | 2026-06-03 | Live |
| **M2** Kanban + Activity + Reports + Persistence | 2026-07-03 | Live (Supabase) |
| **M3** Estimator + Catalog + Cmd+K + Calendar | 2026-08-03 | Live |
| **M4** SOPs library | 2026-09-03 | Live |
| **M5** Lean Tracker (shop floor) + Andon | later | Live |
| **M6** Installer Portal (mobile) | later | Live |
| **M7** CRM + Inventory + P&L | later | Live |

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (CI runs this)
npm run lint
```

`.env.local` (gitignored) holds Supabase credentials. Without it the
app falls back to `localStorage` so you can fork-and-run with no setup.

## Workflow

This project is built with Claude Code in autonomous mode — see the
ADRs in [`docs/decisions/`](docs/decisions/) for the philosophy.

Common operations (slash-command shorthand, see ADR 0003):
- `/work <task>` — autonomous execution against an existing spec
- `/plan-feature <name>` — interview-driven spec for a new feature
- `/feature <name>` — scaffold a feature folder from a finalised spec
- `/verify` — self-check recent changes
- `/checkpoint` — commit with a conventional message

For new features: always run `/plan-feature` first. The spec lives at
`features/<name>/CLAUDE.md` and is the source of truth from then on.

## Design Context

Two strategic docs sit at the project root:

- [`PRODUCT.md`](PRODUCT.md) — register, users, JTBD, brand personality,
  anti-references, design principles, accessibility. The strategic
  source of truth. Read this before any UX/UI work.
- [`DESIGN.md`](DESIGN.md) — visual system in [Google Stitch DESIGN.md
  format](https://stitch.withgoogle.com/docs/design-md/format/): YAML
  frontmatter with the full token set + six markdown sections (Overview,
  Colors, Typography, Elevation, Components, Do's and Don'ts). Read
  this before any visual change.
- [`.impeccable/design.json`](.impeccable/design.json) — machine-readable
  sidecar: tonal ramps, shadow/motion tokens, breakpoints, drop-in
  HTML/CSS for ten signature components, narrative.

**Locked direction (2026-05-24):** *"Sharp, quiet, focused."* North Star:
**The Quiet Foreman.** Visual register: bone-white canvas with a
whisper-warm foot-glow, no-border cards on soft shadow, Cormorant
Garamond serif display + Inter body, dark ink-pill CTAs, clay accent
used sparingly as gradient stops and soft pills (≤5% of any surface).
The Lean status palette (sage / amber / dusty-red / moss / paused /
andon) is held semantic-only.

Tokens live in `src/app/globals.css` (CSS variables) and
`tailwind.config.ts`. **Don't invent new tokens** — update DESIGN.md,
then update the tokens to match.

Background reading: [`docs/build-direction-spec.md`](docs/build-direction-spec.md)
is the original Spec v0.2 (the 12 module wireframes + state-handling
rules). On tone/brand it's superseded by PRODUCT.md (sharp, not soft).
On wireframes and module behaviour, the spec still wins.

## What's still on the shelf

- TV display mode (Spec §12)
- Multi-role auth (Supabase Auth wire-up beyond M1)
- QuickBooks + Google Calendar two-way sync (M3-Q Integrations)
- Mobile voice-measure backend share
- Custom domain (`app.goodwoods.ca`)

These each need either a setup gate (auth, external accounts) or live
data flowing first.
