# Spec — CI authed browser smoke (testing-upgrade tracer bullet)

**Slice:** Phase 1 of the autonomous build workflow (ADR 0018). Branch `feat/testing-e2e-smoke`.
**Scope (locked 2026-06-24):** ONE authed Playwright smoke running in CI against a
seeded local Supabase. No React-Compiler/lint guards, no pgTAP — those are follow-on
slices in the same milestone.

## Why
The autonomous loop can only be trusted to remove Andrew from the per-slice click-through
if an automated browser smoke proves "a real user can log in and see their data" on every
PR. This slice builds that gate. It's also the prerequisite gate `/autobuild` relies on.

## Approach
- **DB in CI:** `supabase start` (full local stack: GoTrue auth + RLS + Postgres) on the
  GitHub Actions runner (Docker provided). From-zero replay of all 32 migrations; the first
  CI run doubles as the migration-replay verification. Local Docker is a later nice-to-have.
- **Seed:** one idempotent script using the **admin API** (adapts `scripts/reset-smoke-user.ts`)
  to create the smoke user + minimal domain data (1 contact + 1 job). Admin API avoids the
  SQL-created-user token-column gotcha (`gw-auth-and-rls`).
- **App:** `next build && next start` (production mode) pointed at the local Supabase
  URL + keys.
- **Test:** Playwright, headless in CI, login via the `type=email`/`type=password` fields +
  clicking the **"Sign in"** button (not Enter).

## Build order (risk-first inside the slice)
1. Scaffold: `@playwright/test` + `playwright.config.ts` + `npm run test:e2e` + a **trivial
   spec** (`/login` renders "Sign in"). Run against `next start` + placeholder env — no
   Supabase needed yet.
2. Wire CI: a new `e2e` job that builds, starts the app, runs the trivial spec. **Prove
   Playwright-in-CI works.**
3. Thicken: add `supabase init` + `supabase start` + the seed script to the CI job; replace
   the trivial spec with the authed flow.

## Definition of Done (the smoke = these checks)
- **Given** a fresh CI run, **when** the `e2e` job boots, **then** `supabase start` replays
  all 32 migrations with no error.
- **Given** the seeded DB, **when** the smoke logs in as the smoke user, **then** it lands
  on the dashboard (not bounced back to `/login`).
- **Given** the seeded job exists, **when** the smoke opens `jobs/[id]`, **then** the job's
  name renders on the page.
- **Given** a PR that breaks that path (e.g. a deliberately broken login button), **when**
  CI runs, **then** the `e2e` job goes **red**.
- The smoke runs against the **local Supabase**, never prod data.

## Non-goals
React Compiler, lint-rule guards, pgTAP RLS, multi-flow coverage, visual regression,
local-Docker setup. All deferred.
