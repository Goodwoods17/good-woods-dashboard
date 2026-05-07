# Shop floor

Drag-and-drop Kanban for work units moving through the four shop stations.

## What it does

Single page (`/shop`) with four columns:

1. **Cut** (WIP limit 3)
2. **Assemble** (WIP limit 4)
3. **Finish** (WIP limit 6)
4. **Install** (WIP limit 2)

Each column shows its work units (cards with job code, description,
started timestamp, optional notes). Drag a card between columns to
update its `station`. WIP limits are advisory — the column header turns
amber when at limit, red when over.

There's also an **Andon** banner at the top: an "Active issues" list of
`AndonEvent`s (unresolved problems someone flagged from the floor).
Anyone can hit the **Andon** button to open a new event.

## Where things live

- `lib/shopStore.tsx` — `WorkStation`, `WorkUnit`, `AndonEvent` types,
  `WORK_STATIONS` constant, `ShopProvider`, `useShop` hook.

The provider is mounted in `src/app/layout.tsx`. Page logic at
`src/app/shop/page.tsx` consumes `useShop()` and renders the Kanban
using `@dnd-kit/core` + `@dnd-kit/sortable`.

## Domain notes

- Work units are **independent of jobs** — a single job spawns multiple
  work units (one per cabinet, or per install phase). The link is by
  `jobCode`, not foreign key.
- WIP (Work In Progress) limits come from Lean manufacturing — a station
  over its limit signals overload. The numbers are starting heuristics;
  Chilly will tune them once the shop runs the system for a few weeks.
- Andon comes from Toyota — pull a cord when you see a problem, the line
  stops, the team helps. Here it's an in-app button + visible banner.

## When to revisit

- Cross-device shop board (foreman's tablet on the wall, installer
  phone, office desktop) → currently localStorage; needs Supabase
  persistence and realtime updates.
- Time tracking on work units → would add `completedAt` and a duration
  view; coordinate with payroll.
- Auto-create work units from a new job → currently manual; could
  template per cabinet count.
