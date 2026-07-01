# Good Woods Dashboard — Project Guide

The shop-management dashboard for Good Woods (Spacecraft Joinery).
This is the project-wide source of truth for _how the code is built_.
Feature-specific rules live in each `features/<name>/CLAUDE.md`; the
visual direction lives in `docs/build-direction-spec.md` / `PRODUCT.md`; the
woodworking vocabulary lives in `docs/domain.md`. When those conflict
with this file on a project-wide matter, this file wins.

## Engineering judgment (how to advise Andrew)

Always recommend the best course of action a senior engineer would
take — the most efficient approach and the highest-quality output —
not merely the literal thing asked for. Andrew is a domain expert
(cabinetmaking) but leans on Claude for engineering judgment, so:

- **Surface the better option.** If there's a cleaner architecture, a
  safer pattern, or a tool/check that would materially improve quality
  or catch bugs, propose it — even if unasked.
- **Explain in plain English + get approval.** Say what it is, why it
  helps, and the rough cost; then let Andrew decide. Don't assume, and
  don't stay silent about something important just because it wasn't
  requested.
- **Bias toward correctness and durability** over the quickest patch —
  especially anywhere money is calculated.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict)
- **Supabase** (Postgres + Auth + RLS) via `@supabase/ssr`
- **Tailwind CSS** with custom design tokens (see `docs/build-direction-spec.md`)
- **Anthropic SDK** for the briefing feature
- Charts: `recharts` · DnD: `@dnd-kit` · Icons: `lucide-react` ·
  PDF: `@react-pdf/renderer` · Motion: `framer-motion`

There IS a build step. This is a real Next.js app, not static HTML —
ignore any older instruction about "no frameworks / double-click to
run / index.html." Those describe a prototype that no longer exists.

## Project shape

```
src/app/<route>/page.tsx   Thin route pages — import a feature view, nothing more
features/<name>/
  ├── CLAUDE.md            Feature spec (canonical; read before touching the feature)
  ├── PLAN.md              Phased implementation roadmap (kept up to date as work lands)
  ├── components/*.tsx     React components (PascalCase, named exports)
  └── lib/*.ts             Logic, types, stores, server helpers (camelCase)
shared/
  ├── components/{layout,ui,forms}/*.tsx   Cross-feature components
  └── lib/*.ts             format, supabase client, auth store, types, utils
supabase/migrations/*.sql  Schema changes, timestamp-prefixed
scripts/*.ts               One-off tooling, run with tsx
docs/                      domain.md, build-direction-spec.md, decisions/ (ADRs), plans/, roadmap.md
```

A route page should be a few lines: import the feature's view and
render it. All real logic lives under `features/` or `shared/`.

## Conventions

- **Path aliases** (tsconfig): `@/*` → `src/*`, `@features/*` →
  `features/*`, `@shared/*` → `shared/*`. Use them; never write deep
  `../../../` relative imports across these boundaries.
- **Client vs server**: add `"use client"` at the top only when the
  component uses hooks, state, or browser APIs. Keep data-fetching and
  Supabase service-role work server-side.
- **Naming**: components `PascalCase.tsx` with named exports
  (`export function FooView()`); lib files `camelCase.ts`; stores end
  in `Store` (`jobsStore`, `contactsStore`); hooks start with `use`.
- **Shared code rule**: anything used by 2+ features goes in `shared/`,
  never copy-pasted between feature folders.
- **Styling**: Tailwind only, using the design tokens from
  `docs/build-direction-spec.md` (e.g. `bg-ink-pill`, `shadow-resting`,
  `duration-fast`). Don't hardcode hex colors or magic spacing when a
  token exists.
- **Money**: format with `formatCAD` from `@shared/lib/format`. Never
  hand-roll currency strings.
- **Domain terms**: use `docs/domain.md` vocabulary precisely in code,
  comments, and UI copy (overlay, reveal, cup, stile, etc.).
- **Comments**: explain _why_, not _what_. Default to none.

## Toolchain — how to verify and run

Run these from the project root. They are the real verification gate
(no mental tracing — let the compiler and linter do the work):

```bash
npx tsc --noEmit     # type-check the whole project
npm run lint         # next lint (eslint: next/core-web-vitals + next/typescript)
npx prettier --check .   # formatting (a PostToolUse hook auto-formats on edit)
npm run build        # full Next.js production build — the ultimate check
npm run dev          # local dev server
npm run briefing:test    # exercise the briefing generator
```

When iterating on UI or API routes, run `npm run dev` via the **Monitor
tool** so type and runtime errors stream into the conversation live
instead of being discovered after the fact.

TypeScript LSP is installed — prefer go-to-definition and the LSP tool
over grep when chasing a type or symbol.

## Supabase

- Schema changes are SQL migrations in `supabase/migrations/`,
  timestamp-prefixed (`YYYYMMDD_description.sql`).
- The Supabase MCP server is connected and scoped to this project —
  apply migrations and run queries through it rather than asking
  Chilly to paste SQL into the web editor.
- RLS is the security boundary. Anything touching client data must be
  locked to authenticated users; never rely on client-side checks.

## Workflow (slash commands in `.claude/commands/`)

`/plan-feature` → `/feature` → `/work` → `/verify` → `/checkpoint`,
plus `/decision` (ADR) and `/explain` (plain-English for Chilly).

- **`/plan-feature`** is the one deliberate, interview-driven step —
  slow down, ask questions, produce `features/<name>/CLAUDE.md` +
  `PLAN.md`.
- **`/feature`** mechanically scaffolds the TSX structure from the spec.
- **`/work`** executes autonomously against the spec + PLAN.md.
- **`/verify`** runs the real toolchain above and auto-fixes what it can.
- **`/checkpoint`** commits with a conventional-commit message.

Honor the feature spec's non-goals. If a task would violate them or a
project-wide rule here, stop and surface the conflict rather than
guessing.

## Hard constraints

- Normal `git push` is allowed. Never run **force-push**
  (`git push --force` / `-f`), `git reset --hard`, `git clean`, or
  `rm`/`rmdir` — these are denied in project settings by design.
- **Tools & dependencies: suggest, don't suppress.** Prefer what's
  already in `package.json` when it does the job, but never silently
  skip a tool, library, or check that a senior engineer would reach
  for. When one would genuinely help (a test runner, a linter, CI, an
  error monitor, a better library), **proactively raise it** — in plain
  English: what it is, why it helps here, the rough cost — and get
  Andrew's approval before adding it. Don't gatekeep useful tooling
  behind "no new deps"; the goal is that Andrew never misses something
  important just because he didn't know to ask for it.
- Don't break the `@/`, `@features/`, `@shared/` import boundaries.
- Keep route pages thin.

## Global memory

Cross-project context lives at `C:\Users\andre\.claude\projects\C--Users-andre\memory\`
(index-first via `MEMORY.md`). See `AGENTS.md` -> "Global memory" for the files that
matter to this project, including `reference/reference_security_practices.md`.
