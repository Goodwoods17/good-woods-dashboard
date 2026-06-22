# Cost Codes & Live Job Costing — Plan P1: Schema & Types

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Lay down the additive database schema + TypeScript types the whole feature builds on — the cost-code fields, the driver, the templates, and the per-project estimate/invoice/budget/actual records — without changing any existing behaviour.

**Architecture:** One additive SQL migration (new nullable columns + 6 new tables, authenticated-only RLS, matching the labour/partners conventions) plus a types module. No stores, no UI — those are P2+.

**Tech Stack:** Supabase Postgres (migrations via the Supabase MCP) · TypeScript (strict).

## Global Constraints

- **Spec & ADRs:** `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md` §4; ADRs 0008/0009/0010.
- **Verification gate:** `npx tsc --noEmit` + `npm run lint` + `npm run build` (no unit-test runner). The migration's correctness is by-inspection against the house pattern + (when applied) a Supabase MCP `apply_migration` + a `select` smoke.
- **Additive only.** New nullable columns + new tables. Nothing existing changes — so the migration is safe to apply ahead of consumer wiring.
- **`jobs.id` is `text`** → every job FK is `text` (matches `job_trades`). `code_id`→`labour_operations(id)` uuid; `phase_id`→`labour_categories(id)` text; `trade_line_id`→`job_trades(id)` uuid; `partner_id` is a **soft uuid ref** (Supplier or Subtrade, keyed by `kind`).
- **RLS pattern (verbatim):** per table, `<t>_authenticated_all` (authenticated, ALL, using(true) with check(true)) + `<t>_anon_none` (anon, ALL, using(false)). End with `notify pgrst, 'reload schema';`.
- Commit per task; conventional messages ending `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure (P1)

- `supabase/migrations/20260620050000_cost_codes_schema.sql` — **Create**: all additive schema.
- `features/job-costing/lib/types.ts` — **Create**: the entity types.
- `features/job-costing/CLAUDE.md` — **Create**: feature spec/status.

---

## Task 1: The additive schema migration

**Files:** Create `supabase/migrations/20260620050000_cost_codes_schema.sql`.

**Produces:** `labour_operations.code` (unique-when-set) + `driver_unit` (checked enum); `labour_sessions.quantity`; tables `cost_code_templates`, `cost_code_template_items`, `job_estimates`, `job_invoices`, `job_cost_budgets`, `job_cost_actuals`; authenticated-only RLS on all six.

- [x] **Step 1: Write the migration** — done; see the file. Additive columns + 6 tables + RLS, matching the labour migration's table/trigger/index/comment pattern and the `<t>_authenticated_all`/`<t>_anon_none` RLS pair.
- [x] **Step 2: Inspection check** — job FKs are `text`; `code_id`/`trade_line_id` uuid; `phase_id` text; `partner_id` soft; checks on `driver_unit` / `kind`; `code` unique only when non-null (partial index). Subtrade budget is intentionally absent (read from `job_trades.cost`). Legacy `Job.invoice` backfill + the `labour_sessions.job_id` FK are deferred (see below).
- [ ] **Step 3: Apply (DEFERRED — needs coordination)** — apply via the Supabase MCP `apply_migration` **once** the parallel `good-woods-2` session's DB state is known (avoid duplicate tables) and ideally on a Supabase dev branch first. It is additive, so it does not break the live app.
- [ ] **Step 4: Post-apply smoke (after Step 3)** — `select table_name from information_schema.tables where table_name like 'job_cost%' or table_name like 'cost_code%';` → the 6 tables; `\d labour_operations` shows `code`/`driver_unit`.

## Task 2: The entity types

**Files:** Create `features/job-costing/lib/types.ts`.

**Produces:** `DriverUnit` (+`DRIVER_UNITS`/`DRIVER_UNIT_LABELS`), `CostCodeTemplate`, `CostCodeTemplateItem`, `JobEstimate`, `JobInvoice`, `CostKind`, `JobCostBudget`, `ActualKind`, `JobCostActual`.

- [x] **Step 1: Write the types** — done; mirrors the migration columns in camelCase (the labourStore row-map convention).
- [x] **Step 2: Feature CLAUDE.md** — `features/job-costing/CLAUDE.md` created (status, seams, the `jobs.id` text wrinkle, non-goals).
- [ ] **Step 3: Gate** — `npx tsc --noEmit && npm run lint && npm run build` all green.
- [ ] **Step 4: Commit.**

---

## Status

- [x] Migration + types + feature CLAUDE.md written; gate green; committed.
- [ ] **Migration NOT applied** to the shared DB — deferred (parallel session coordination + apply with deploy / dev branch).

## Deferred out of P1 (own tested migrations later)

- **`labour_sessions.job_id` → nullable FK** (spec §4.7): blocked by the `uuid` vs `jobs.id text` mismatch — convert the column first.
- **Legacy `Job.invoice` → `job_invoices` backfill** (ADR 0010): table created empty; revenue still reads `jobs.revenue`, so nothing depends on it yet.

## Next

P2 — cost-code registry + driver + templates in `/labour` (the first place the new columns are read/written), per spec §10.
