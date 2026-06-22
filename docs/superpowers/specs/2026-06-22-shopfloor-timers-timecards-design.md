# Shop Floor — Timers in the Kanban, Employees, & Daily Time Cards (Design Plan)

- **Date:** 2026-06-22 (drafted overnight for Andrew's morning review)
- **Status:** DRAFT for discussion — strong recommended direction + the real decisions flagged. Nothing built yet.
- **Asked for (Andrew, 2026-06-21 night):** "review the labour feature, kanban card setup, plan rework on the timer feature and how it will work in the app. How we can integrate it in the kanban card workflow with myself and employees. And then make daily time cards to track hours for projects and each employee."
- **Companion to:** the job-costing feature (`features/job-costing/CLAUDE.md`, ADRs 0008–0010). This is the **capture** side (accurate time per job + per person); job-costing is the **analysis** side (budget-vs-actual, P&L). They meet at `labour_sessions`.

---

## 1. The one-paragraph vision

Today timers live on a standalone `/labour` page and the shop kanban (`/shop`) is a separate, time-less board of physical "work units." The rework fuses them: a **shop-floor work board** where each **card is a real task on a real job**, an **employee taps Start/Stop right on the card**, and that time becomes three things at once — **(1)** the job's live labour actual (feeds job-costing budget-vs-actual), **(2)** a line on that employee's **daily time card** (hours per project, per day, for payroll), and **(3)** the historical average that sharpens the next bid. One tap on the floor, three payoffs.

## 2. Current state (what we're reworking)

**Timers (`features/labour/`)** — start/stop a `labour_session` by picking *operation + worker + (optional) job*. Sessions log `started_at`/`ended_at`, `worker_id`, `job_id` (soft ref), and now `quantity` (for driven cost-codes). Analytics roll up **per operation / per category** (the bottleneck finder) — **not per worker, not per day, no time cards**. Worker roster (`labour_workers`) is a flat editable list with **no rate and no login**.

**Shop kanban (`features/shop/`)** — 4 station columns (Cut · Assemble · Finish · Install) with drag-and-drop, WIP limits, and an Andon issue banner. A card = a `shop_unit` (a physical piece), loosely linked to a job by `job_id`. **No time tracking on cards.** Stations now overlap awkwardly with the 6 phases.

**Pipeline kanban (`features/jobs/`)** — jobs grouped by `pipelineStatus` (a different axis: sales/production status, not shop work).

**Rates** — `workspace_settings` holds three **phase-based** rates (design / shop / install), used by the estimator. **No per-employee pay rate.**

**Key gap table:**

| Need | Today | Gap |
|---|---|---|
| Clock time on a kanban card | Timers and cards are separate features | Card needs job + task + assignee + Start/Stop |
| Per-employee hours | `worker_id` on each session | No per-worker view; no daily roll-up |
| Daily time cards | — | No timecard concept at all |
| Per-project labour cost | Phase rates exist; sessions carry job_id | Sessions → job $ rollup not wired |
| Employee $ costing / payroll | — | No per-worker pay rate |
| Reliable job tagging | `job_id` optional on a session | Often left blank → time not attributable |

**Schema wrinkle to fix:** `labour_sessions.job_id` is `uuid` while `jobs.id` is `text`. Any real job↔time link needs a `uuid→text` conversion first (already flagged in the job-costing spec §4.7).

## 3. Recommended direction (react to this)

**A. The card becomes the unit of work AND the timer.** A shop-floor card = **one task on one job** = `job × phase` (optionally narrowed to a cost-code/operation). It shows: job name, phase/operation, **assigned employee(s)**, a big **Start/Stop**, and accumulated time. Tapping Start writes a `labour_session` tagged `(worker, job, operation)`; Stop closes it (+ quantity for driven codes). Dragging the card across phase columns advances the work (and can nudge the job's milestone). This directly answers "integrate the timer in the kanban card workflow."

**B. Fold the two shop concepts into one board, on the 6-phase spine.** Retire the ad-hoc `shop_unit` stations (Cut/Assemble/Finish/Install) in favour of columns = the **6 phases** (Design · CNC/Cut · Assembly · Finishing · Delivery · Install) — the same axis as milestones and labour categories, so everything finally lines up 1:1. Keep the Pipeline board (by job status) separate; it answers a different question (which jobs are selling/installing), not who's-doing-what-right-now.

**C. Employees as first-class, but no per-person login yet.** Promote `labour_workers` to real **employees** with a **pay rate** and **active** flag. Clocking happens on a **shared shop terminal/tablet**: tap your name → tap your card → Start. This fits a small shop and avoids per-user auth/RLS for v1. Per-employee logins (each sees only their cards) is a clean Phase-4 upgrade once the flow is proven.

**D. Daily time card = a roll-up view, not a new source of truth.** A time card is `labour_sessions` grouped by **(employee, day)**: every entry (job, task, start–stop, hours), a day total, and a per-job subtotal. Two lenses: **per employee** (payroll: total hours/day, overtime flag) and **per project** (job-costing: hours + $ by job). Add light **edit/approve** (today there's no edit-after-fact — payroll needs a correction path). Export to CSV/PDF for the bookkeeper.

**E. Two rates, two purposes — keep them separate.** Per-employee **pay rate** drives payroll + true labour cost on a job. The existing **phase rates** stay for *estimating* (the bid doesn't know who'll build it). Job-costing actual labour $ = Σ session-hours × that employee's pay rate; budgeted labour $ = phase rate. The variance between them is itself a useful signal.

## 4. Proposed data model (additive)

- **`labour_workers` → employees:** add `pay_rate numeric`, keep `active`. (Optional later: `auth_user_id` when logins arrive.)
- **Work cards:** evolve `shop_units` (or a new `work_cards`) to carry `job_id (text FK)`, `phase_id (→ labour_categories)`, `operation_id (→ labour_operations, nullable)`, `assignee_id (→ labour_workers, nullable)`, `status`, `sort`. A card is the durable "task"; sessions are the time events against it.
- **`labour_sessions`:** add `card_id (nullable FK)` so a timer started from a card links back; **fix `job_id` to `text` + real FK** (the deferred §4.7 conversion). Everything else already exists (`worker_id`, `started_at/ended_at`, `quantity`).
- **Time cards:** **no new table** — a derived view over `labour_sessions` grouped by `(worker_id, date)` and `(worker_id, job_id)`. (Add a `timecard_approvals` table only if/when sign-off is needed.)

All additive, RLS authenticated-only, validated via the transactional dry-run trick (see [[gw-supabase-migration-history-drift]]) before applying.

## 5. How it threads into what's already built

- **Job-costing (just shipped P0/P1):** these sessions ARE the labour actuals (spec §4.4). This rework makes them *reliable and per-person*, which is exactly what the P4 Budget-vs-Actual tab and the P5 P&L rollup consume. **Build order matters:** solid capture first, then the analysis surfaces light up with real data.
- **Cost-code templates (P2b, in progress):** a template's codes can **auto-generate the work cards** for a job at Save-as-Job — so the board is pre-populated with the right tasks instead of hand-built. Nice synergy.
- **Partners/installers:** subtrade installers (`job_trades.person_id`) are a *different* labour pool than shop employees. Keep them distinct for now; a future "who's on this job" view could merge both.

## 6. Phased build (proposed)

- **P1 — Employees + reliable capture.** Add pay rate to the roster; make job-tagging first-class on the existing timer; fix the `job_id` uuid→text FK. Leaves `/labour` working, just richer.
- **P2 — Timer on the card.** New shop-floor board on the 6-phase spine; cards carry job+phase+assignee+Start/Stop; clocking writes sessions. Retire/migrate the old station board.
- **P3 — Daily time cards.** Per-employee and per-project roll-up views; edit/approve a day; CSV/PDF export.
- **P4 — Wire to money + (optional) logins.** Per-employee labour $ onto the job + into job-costing budget-vs-actual; payroll export; optionally per-employee logins (each sees their own cards).

Each phase leaves the app green and demoable (the house rule).

## 7. Open questions for the morning (the real forks)

1. **One board or two?** Fold the shop station board into a single 6-phase "shop floor" board (recommended), or keep stations as their own thing alongside?
2. **Login model:** shared shop terminal (pick-your-name, recommended for v1) vs each employee logs in?
3. **Card granularity:** clock against the whole **phase**, or down to an **operation/cost-code**? (Finer = better job-costing, more taps.)
4. **Auto-generate cards** from a job's cost-code template (recommended) vs hand-add per job?
5. **Time card purpose & approval:** payroll hours, job-costing actuals, or both? Do you want a daily review/approve + edit-a-mistake flow (recommended — payroll needs corrections)?
6. **Per-employee pay rates:** confirm we add them (needed for true labour $ + payroll), separate from the estimating phase rates.
7. **Milestone sync:** when a card moves to a new phase column, should it advance the **job's milestone** automatically, or stay independent?
8. **Multiple employees per card** (two people assembling together) — supported, or one assignee per card?

## 8. Why this is the right shape

It collapses three half-built things (standalone timers, the station board, the unwired job-cost actuals) into one coherent loop that matches how the shop actually runs: *a person, doing a task, on a job, for a stretch of time.* Capture that one fact well and payroll, job profitability, and better bids all fall out of it. It also finally puts **milestones, labour categories, and shop columns on the same 6-phase spine**, ending the current three-axis confusion.
