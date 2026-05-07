# 0004. Next.js + TypeScript + Supabase (supersedes 0001)

Date: 2026-05-07

## Status
Accepted — supersedes ADR 0001.

## Context

ADR 0001 (written earlier the same day) proposed plain HTML/CSS/JS with
no framework and no build step. By the time the autonomous restructure
ran, the codebase was already a working, deployed Next.js 14 app with
Supabase persistence, M1–M7 features live in production, and a Vercel
auto-deploy from `main`.

ADR 0001's constraint (zero install, double-click `index.html`) would
have required throwing away the working app and rebuilding it. That's
a multi-week rewrite with no upside — the current stack is shipping
features fast and Chilly hasn't hit any pain that the constraint would
solve.

## Decision

Adopt the actual current stack as canonical and supersede ADR 0001:

- **Next.js 14** (App Router) — file-system routing in `src/app/`,
  React Server Components where useful, client components for the
  interactive surfaces.
- **TypeScript** in `strict` mode — type safety for the cabinet domain
  (margin, milestones, statuses).
- **Tailwind** with CSS-variable design tokens locked from the Build
  Direction Spec PDF §3.
- **@supabase/ssr + @supabase/supabase-js** for cross-device persistence
  (Canada Central). Falls back to `localStorage` when env vars are
  unset, so fork-and-run still works.
- **shadcn/ui + lucide-react + @dnd-kit + recharts + @react-pdf/renderer**
  — opinionated picks for the UI primitives, drag-and-drop, charts,
  and invoice rendering.
- **Vercel** for hosting; auto-deploy from `main`.
- **Build step required.** `npm install` and `npm run build` are part
  of the workflow. No more "double-click index.html."

## Code organisation

- `src/app/` — Next.js routes. Page files stay here (App Router
  requirement) and are thin wrappers that pull state from a feature
  store and render feature components.
- `features/<name>/` — feature-scoped code. Each feature owns its
  components, lib, and a `CLAUDE.md` spec describing what the feature
  does and what it deliberately doesn't.
- `shared/` — code used by more than one feature. Layout primitives,
  UI primitives, formatters, types, the auth store, the Supabase
  client.
- `data/` — local JSON test fixtures (when needed).
- `docs/` — domain glossary, ADRs, roadmap.

Path aliases (in `tsconfig.json`): `@/*` → `src/*`,
`@features/*` → `features/*`, `@shared/*` → `shared/*`.

## Alternatives reconsidered

- **Plain HTML rewrite (per ADR 0001)** — Rejected. Would discard a
  working app to satisfy a constraint that hasn't paid off in practice.
  Revisit only if Next.js itself becomes the source of pain
  (deploy issues, dependency churn that blocks shop work, etc.).
- **Static site generator** — Same problem as plain HTML, plus loss of
  Supabase auth and cross-device sync.

## Consequences

**Positive:**
- Keeps the shipped app shipping. M1–M7 stay live.
- TypeScript catches whole classes of cabinet-math mistakes at compile
  time.
- Vercel + Next.js gives free preview URLs per branch.
- Supabase Auth + Postgres covers the "1–3 people on multiple devices"
  use case cleanly.

**Negative:**
- Build step is non-zero. `npm install` is required. Anyone running the
  app needs Node.
- Some dependency churn — Next.js/Supabase/dnd-kit will need periodic
  upgrades. Acceptable cost.
- Loss of "edit in any text editor and refresh" — local dev requires
  `npm run dev`.

## Revisit when

- Vercel pricing or Next.js direction stops fitting the use case.
- A feature requires real-time multi-user collaboration that Supabase
  can't easily provide.
- The dependency tree triggers an actual incident (security patch
  needed urgently, dependency abandoned, etc.).
