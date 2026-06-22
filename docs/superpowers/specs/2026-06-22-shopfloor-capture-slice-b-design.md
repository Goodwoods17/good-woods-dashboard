# Slice B — Shop-floor capture + daily time cards (Design)

- **Date:** 2026-06-22 (brainstormed with Andrew)
- **Status:** DRAFT — design approved by Andrew; next step is grill-with-docs (before planning).
- **Part of:** the P4 stack (`2026-06-22-cost-code-registry-and-p4-stack-design.md`, Slice B).
  This is the **capture** side — it produces the reliable per-code, per-worker labour
  **actuals** that P4 (Budget-vs-Actual) and P5 (P&L) consume.
- **Reworks/supersedes the scope of:** `2026-06-22-shopfloor-timers-timecards-design.md`
  (the 4-phase mega-spec). This slice takes its **P1+P2 core** (reliable capture on
  cards) **plus hours-only daily time cards**, and defers the rest.
- **Builds on:** Slice A (the live cost-code registry — the card's code pick-list), the
  pace timer (ADR 0011 / PR #10 — reused on the card), the 6 phases (ADR 0008).

## Scope

**In:** a 6-phase shop-floor board where each card is a task **linked to a cost code**;
tapping Start/Stop on a card writes a `labour_session` tagged `(worker, job, code, card,
quantity)`; plus **daily time cards** as hours roll-ups (per employee / per project).

**Deferred to later slices:** per-employee **pay rates + payroll $**, **employee logins**
(shared shop terminal for now — pick your name), a formal **approve/sign-off** workflow.

## Decisions (from the brainstorm)

1. **A card = a task linked to a cost code.** Cards seed from four sources (max
   flexibility — "most jobs aren't the same"): the **frozen budget** (each budgeted code
   → a card with its target qty), the **Job template** code set, **hand-add at job
   start**, and **add mid-job**. Adding/relabelling a card picks its code from the **live
   registry (Slice A)**. A mid-job card for an unbudgeted code shows as pure variance in
   P4 (matches the glossary's "unbudgeted task = variance").
2. **Board = shop-wide summary + per-job drill-in.** A shop-wide view ("Running now" =
   every active session + "My cards" per worker) and a per-job view (that job's cards in
   the 6 phase columns).
3. **Many workers per card.** A card has an optional `assignee` (owner), but the timer is
   per-person: each worker taps their name + Start → their **own** `labour_session`
   against the card. The session model already carries `worker_id`, so no many-to-many.
4. **Cards don't drag between phase columns.** A card's phase is intrinsic to its cost
   code (ASM-BASE is always Assembly). Progress is the card's **status** (`todo`→`doing`
   →`done`) within its column. To move work to another phase you change the card's code.
5. **Milestone nudge, never automatic.** When every card in a phase is `done`, offer to
   advance the job's milestone (a suggestion; the user confirms).
6. **Corrections = simple edit/delete** of a session's start/end/quantity (today there's
   no edit-after-fact; hours accuracy needs it). No formal approval workflow in v1.

## Data model (additive, RLS authenticated-only)

- **`work_cards`** (new): `id`, `job_id text` (FK → jobs), `operation_id uuid` (FK →
  `labour_operations` — the cost code; nullable for a non-coded task), `phase_id text`
  (FK → `labour_categories`; set from the code's category, or chosen for a non-coded
  card), `title text`, `target_quantity numeric` (nullable; from the budget), `assignee_id
  uuid` (FK → `labour_workers`, nullable), `status text` check (`todo`/`doing`/`done`),
  `source text` check (`budget`/`template`/`manual`), `sort int`, timestamps.
- **`labour_sessions`**: add `card_id uuid` (nullable FK → work_cards). **Fix `job_id`
  `uuid` → `text` + real FK to `jobs(id)`** — the deferred §4.7 conversion. `worker_id`,
  `started_at`/`ended_at`, `quantity` already exist.
- **No** pay-rate column, **no** timecard table (time cards are derived — below).

> ⚠️ **The `job_id` uuid→text conversion is the one genuinely risky step** — a type
> change on a live column with existing rows. Do it in its **own task**: snapshot the
> column, convert with an explicit cast (existing values are uuids-as-text), add the FK,
> validate with the transactional dry-run trick ([[gw-supabase-migration-history-drift]]),
> with a backup taken first. If any existing `job_id` doesn't match a `jobs.id`, null it
> (don't fail the migration) and report the count.

## Card lifecycle

- **Seed at Save-as-Job:** the frozen `job_cost_budgets` labour rows → one `work_card`
  per code (`source='budget'`, `target_quantity` from the budget, `phase_id` from the
  code, `status='todo'`). (Reuses the same write path that freezes the budget.)
- **Seed from template / hand-add / mid-job:** create a `work_card`, pick the code from
  the live registry (sets `phase_id`), set an optional target + assignee.
- **Status:** `todo` → `doing` (first Start) → `done` (manually marked, or all target
  quantity logged). A card persists across many sessions.

## The board (UI)

- **Shop-wide summary** (`/shop` reworked): "Running now" (active sessions, who+what+pace)
  and "My cards" (filter by worker). Entry points to drill into a job.
- **Per-job board:** the job's cards in the 6 phase columns; each card shows title, code,
  target, assignee, status, accumulated time, and the **pace timer** control.
- Columns = the 6 phases (Design · Cut · Assembly · Finishing · Delivery · Install). Cards
  sit in their code's phase; no cross-column drag.
- *(UI craft — `impeccable` pass after the build, per the standard workflow.)*

## Capture (reuses the pace timer)

The card's Start/Stop **is** the pace timer (PR #10): Start → `labour_session(worker_id,
job_id, operation_id=code, card_id, started_at)`; the card shows **suggested time + pace
colour** (`pace.ts`); **Stop** → sets `ended_at` and prompts **quantity done** for driven
codes. Worker is picked on the shared terminal (no login). Many workers → many sessions
on one card.

## Daily time cards (hours only — derived view)

No new table — a view/query over `labour_sessions`:
- **Per-employee lens:** `(worker, day)` → entries (job, task/code, start–stop, hours),
  day total. (Overtime flag is a later, pay-aware concern — out of scope.)
- **Per-project lens:** `(job, day)` → hours by worker.
- **Corrections:** edit/delete a session's `started_at`/`ended_at`/`quantity` (a small
  form; writes back to `labour_sessions`). No approval workflow.
- **Export:** CSV (hours only — no $; the bookkeeper gets dollars once pay rates land).

## How it threads to P4

These sessions are P4's labour actuals, now **reliable** (job-tagged via the card, not
optional), **per-code** (`operation_id`), and **per-worker**. Actual labour-$ in P4 =
Σ session-hours × the code's snapshot rate (Slice A/P4 decision); per-employee $ waits for
pay rates (a later slice).

## Verification

- Migrations validated via the transactional dry-run; the `job_id` conversion proven on a
  copy first; backup taken.
- Pure logic (card-seeding from a budget, the time-card grouping) gets `tsx` tests.
- Authenticated browser smoke: Save-as-Job seeds cards → open the board → Start a card as
  a worker → Stop with a quantity → confirm a `labour_session` row tagged
  `(worker, job, code, card, qty)` → confirm it appears on that worker's daily time card.

## Open items for the grill

- The `work_cards` vs the existing `shop_units` table — evolve `shop_units` or a clean new
  `work_cards`? (Spec leaned "evolve or new"; the grill should decide against the domain.)
- Terminology: "card" vs "task" vs "work unit" vs the existing `shop_unit` — sharpen in
  `docs/domain.md`.
- Does a non-coded card (no `operation_id`) belong, or must every card carry a code?
- Milestone-nudge mechanics (where it surfaces).
- The `job_id` conversion's handling of orphan rows.
