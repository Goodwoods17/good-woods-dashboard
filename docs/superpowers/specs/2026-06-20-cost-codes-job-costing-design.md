# Cost Codes & Live Job Costing — Design Spec

- **Date:** 2026-06-20
- **Status:** Approved (design); ready for implementation plan
- **Author:** Andrew + Claude (brainstorming session)
- **Touches:** `features/labour`, `features/estimator`, `features/jobs`, `features/pnl`, `shared/lib`, new migrations

---

## 1. Problem & goal

Today the three relevant features don't talk to each other at a useful granularity:

- **Labour** (`/labour`) tracks live timers per operation (under 6 phase-categories) but has **no dollar costing** and only a soft `job_id` on sessions.
- **Estimator** (`/estimator`) prices a quote, then on _Save as Job_ collapses labour into flat `materials/labour/overhead` `CostLine`s. The estimate itself is **not persisted**, so there's no budget baseline to compare against.
- **P&L** (`/pnl`) is **portfolio-only and after-the-fact**: it sums each job's `revenue − costs` and buckets by `installDate`. There is no per-job, in-flight, or per-code view.

Andrew wants to know **how a job is doing while it's still open** — not after — so he can strategize mid-job to claw money back or keep a healthy job on track.

**The core idea:** a **cost code** is the shared key that flows _estimate → job → actuals → history_, letting budgeted vs. actual be compared at a granularity finer than the whole job, in real time.

## 2. Locked decisions (from the interview)

1. **A cost code is a labour operation nested under one of the 6 phases** (Design · CNC/Cut · Assembly · Finishing · Delivery · Install). Two-level model: **phase → code**. Builds directly on today's `labour_operations` (operations under categories).
2. Codes are **pulled into estimate templates** as budgeted time-markers, and **new codes can be added mid-job** (operations are already runtime-addable).
3. Codes are **markers for labour time**; their actual-time history produces **historical averages that seed future bids**.
4. **Live feedback lives on each Job** (a new Budget-vs-Actual tab) **and rolls up into `/pnl`** across open jobs.
5. **v1 scope = full job margin** — labour actuals **and** material/sub actuals, so the live number is true revenue − cost.
6. Andrew wants a **running estimate-vs-actual timeline marker on the job**.
7. The five timeline treatments are **all wanted, as switchable views over one dataset** (not a single pick).
8. Future: roll into a **shop employee time tracker** ("who did what on each job") — the `worker_id` seam already exists.
9. **Change orders = a new estimate + new invoice within the same project** — budget and revenue accumulate across cycles; an unbudgeted non-change-order task (rework/scope creep) shows as variance against the existing budget.
10. **QuickBooks-ready** — model **Estimate** + **Invoice** as light first-class records and align all terminology/shapes to QB (**ADR 0010**); the sync itself is out of scope for v1.

## 3. Approach chosen

**Approach A — cost-code ledger with the budget stored on the Job.** The estimate authors a coded budget that is written onto the job at _Save as Job_; actuals accrue against it.

**Rejected alternatives:**

- **B — persist the whole estimate as the budget.** Architecturally purest (one budget source, re-openable estimates) but drags in the long-deferred estimate-persistence project and reworks the estimator. Too big a blast radius for v1.
- **C — phase-level only (no per-operation codes/templates).** Under-delivers the explicit ask. Folded into A's rollout as the early phase rather than shipped as the destination.

## 4. Data model

### 4.1 Cost-code registry — extend `labour_operations`

Promote the existing operations table into the canonical cost-code registry. **New columns:**

- `code` — short, editable, **unique** identifier (e.g. `ASM-BASE`, `FIN-SPRAY`). Auto-suggested from the operation name; editable. This is the marker tying estimate ↔ timer ↔ actuals.
- Phase = the existing `category_id` (the 6 phases). **No new column** — categories _are_ phases; UI language shifts to "phase".
- `driver_unit` (nullable) — an optional **driver**: the unit a code's time scales with (`sheet` · `bf` · `board` · `lf` · `sqft` · `ea`). **Null = a flat, time-only code** (Design, Spray-per-batch). One driver per code (two drivers → two codes). Units come from a managed list reusing the estimator's `Unit` plus `sheet` / `board`, so per-unit averages stay comparable. Generalizes today's cabinet auto-derive (cabinet count × min/cabinet).

**Historical average is computed, not stored** — derived from completed `labour_sessions` for that code, so it's always live and there is nothing to keep in sync. Exposed via the labour store so the estimator can default a code's budgeted minutes to its history. Rules:

- **Per-unit for driven codes** — a driven code's average is **minutes ÷ unit** (Σ minutes ÷ Σ session quantity), so it estimates as `qty × min/unit`; a flat code's average is minutes per session.
- **Recent-weighted**, not all-time — favour the last ~10 sessions / 12 months so a bid reflects how the shop runs *now*.
- **Outlier-trimmed** — ignore sessions beyond ~3× the median (a forgotten-running timer can't poison the average); trim only kicks in once there are enough samples to spare.
- **Any real data beats the hand-set default** — with 1–2 samples, use them and show a **confidence / sample count** (e.g. "based on 2 jobs"); only with **zero** samples does the code fall back to its hand-set / template default.
- The **≥3-sample bar** remains only for the *approve-to-apply nudge* that suggests rewriting a code's saved default — a higher bar to *change* a number than to *pre-fill* one.

Operations remain runtime-addable + soft-deletable (`active=false`), so **adding a task mid-job already works**.

### 4.2 Cost-code templates (new)

The estimating bundles. Two tables:

- `cost_code_templates` — `id`, `name` (e.g. "Full kitchen build", "Reface only"), `active`.
- `cost_code_template_items` — `template_id`, `code_id`, `budgeted_minutes` (defaults to the code's historical average), `qty` (default 1), `sort`.

These are **distinct from the estimator's existing section-templates** (which only toggle sections). UI name: **"task templates"** to avoid confusion.

### 4.3 Job budget (new `job_cost_budgets`)

Written at _Save as Job_; editable on the job afterward. One row per budgeted labour code, plus material rows per phase:

- `id`, `job_id`, `estimate_id` (FK → `job_estimates`, §4.8 — which budgeting cycle this line belongs to), `code_id` (nullable — null for a phase-level material budget row), `phase_id` (snapshot), `kind` (`labour` | `material`), `budgeted_quantity` (nullable — driven codes), `budgeted_minutes` (labour only; for a driven code = `quantity × min-per-unit`), `rate` (snapshot, labour only), `budgeted_amount`, `sort`.

Snapshotting phase + rate matches labour's "history never rewrites" philosophy. **Subtrade budgets are not stored here** — they're read live from each trade-line's `job_trades.cost` (ADR 0007's captured-for-future field), mapped to the trade's phase. This realizes ADR 0007 §9's "future P&L tie-in" without duplicating the number.

### 4.4 Actuals — two sources, one ledger view

- **Labour actuals** = the existing `labour_sessions`, reliably tagged `job_id` + code. No new table; the timers already run _are_ the actual labour data. Actual labour-$ = `Σ session minutes × rate` (rate from the code's phase, via workspace settings). A **driven** code's session also records `quantity` (units done that run, captured on _Stop_), so actual minutes-per-unit and physical %-complete are known.
- **Material / subtrade actuals** = new `job_cost_actuals` — `id`, `job_id`, `kind` (`material` | `subtrade` | `labour_adj`), `amount`, `partner_id` (nullable — the **Supplier** or **Subtrade** paid; aligns the ledger with the Partners model, ADR 0007), `trade_line_id` (nullable — for a subtrade actual, the job trade-line it fulfills), `code_id` (nullable), `phase_id` (nullable), `date`, `note`, `created_at`. Where a lumber invoice (Supplier) or subtrade bill is logged as it lands. **Attribution only — no PO/invoice auto-import in v1**; the partner link sets up that future integration.

### 4.5 The granularity rule (sanity-checked with Andrew)

- **Labour** budgets/actuals live at the **code** level (that's what timers measure).
- **Materials** don't belong to a single operation code, so they are budgeted and logged at the **phase** level (optionally tagged to a code). The variance view reads, per phase: budgeted labour-$ + material-$ vs actual labour-$ + material-$, with a **labour-only code-level drill-down** underneath.

### 4.6 RLS

All new tables: authenticated-only, matching the rest of the app (see `gw-auth-and-rls`). Seeded server-side like the existing labour tables.

### 4.7 Referential integrity & the labour↔job link

- The new costing tables use **proper FKs**: `job_cost_budgets` / `job_cost_actuals` → `job_id` NOT NULL FK; `code_id` / `phase_id` / `partner_id` / `trade_line_id` nullable FKs.
- **`labour_sessions.job_id` is upgraded from a soft ref to a nullable FK** (`ON DELETE SET NULL`). Now that this link carries dollars, a _set_ value must point at a real job — no silent misattribution. **Null stays allowed** for untagged / ad-hoc shop work, preserving the decoupling's real benefit (timers that don't require a job). This **reverses the "no FK" line in `features/labour/CLAUDE.md`**, to be updated when the change lands.
- **Untagged time** (null `job_id`) is rolled into a visible "shop time not on a job" bucket, never dropped; sessions can be **retro-assigned** to a job + code.

### 4.8 Estimates & Invoices (QuickBooks-ready — ADR 0010)

A project (Job) accrues **multiple budgeting + revenue cycles** over its life (the original quote plus change orders). Two light, project-scoped records mirror the QuickBooks objects they'll later sync to:

- **`job_estimates`** — `id`, `job_id`, `label` (e.g. "Original", "Change order 1"), `date`, `total`, `created_at`. Owns its `job_cost_budgets` lines (§4.3). The durable summary the estimator emits on _Save as Job_ — **not** a re-editable estimate document (ADR 0009 holds). Maps to QB **Estimate**.
- **`job_invoices`** — `id`, `job_id`, `number`, `issued_date`, `due_date`, `amount`, `created_at`. Each adds to the project's revenue. Maps to QB **Invoice**.

**Rollups:** project budget = Σ its estimates' lines; project revenue = Σ its invoices. `Job.revenue` stays the canonical revenue total (= Σ invoices) so `computeMargin` / `/pnl` are **unchanged**; the embedded legacy `Job.invoice` is migrated into `job_invoices` as the first row (sequenced carefully against the existing invoice-render path — a plan-level detail, not a v1 invoicing rewrite).

**No `quickbooks_id` columns / sync table in v1** — the readiness deliverable is the aligned shapes + names (Phase=Class, Cost code=Item, …); the sync is later a central `quickbooks_links` mapping table added with no change to these tables. Full mapping in ADR 0010.

## 5. Estimator → budget flow

**Additive — the estimator's pricing math is untouched.** The estimator keeps its current labour pricing (cabinet auto-derive + freeform labour lines); we add a breakdown layer that becomes the budget baseline.

**New "Labour cost codes" panel** (a bespoke block, like Pre-work / Delivery / Deficiencies):

1. **Load a task template** → drops in that template's codes, grouped by phase, each with budgeted minutes pre-filled from the code's **historical average** (fallback: its default).
2. **Auto-seed from the cabinet summary** — the counts already entered ("4 base, 6 wall…") pre-create matching assembly/install code rows (`ASM-BASE ×4`, etc.), so nothing is double-entered.
3. **Add / remove / adjust** codes for this job; this is also where a one-off code gets coined (then available for mid-job use).
4. Each row: `code · phase · qty · budgeted min · rate · $`. Panel total = the **labour budget**.

**Reconciliation guard (against double-counting):** the quoted _price_ is unchanged. The coded panel is the **allocation** of labour into trackable codes. An inline note flags if the coded labour budget drifts from the quote's labour subtotal, so what you track against matches what you bid. **No silent divergence.**

**Material budget per phase** is derived by grouping the existing material-section subtotals under their phase, via this **section → phase mapping** (default; adjustable):

| Estimator section | Phase |
| --- | --- |
| prework | Design |
| casework | Assembly |
| cnc | CNC/Cut |
| doors | Finishing |
| face | Assembly |
| finishing | Finishing |
| assembly | Assembly |
| delivery | Delivery |
| install | Install |
| deficiencies | Install |

**On `Save as Job`:** alongside the normal `CostLine[]`, write `job_cost_budgets` — one labour row per code (minutes, rate, $) + one material row per phase ($). The budget baseline is now frozen on the job (editable later).

## 6. Job "Budget vs Actual" tab

A new tab on the Job detail page. **One shared data layer** feeds every view:

- Per phase: budgeted labour-$ + material-$ vs actual labour-$ (from `labour_sessions`) + actual material/sub-$ (from `job_cost_actuals`), all timestamped so anything can be drawn over time.
- Per code (labour): drill-down inside each phase.

A **segmented view switcher** (Andrew wants all five, as switchable lenses):

| View | Answers |
| --- | --- |
| **Timeline lane** (E) — _default_ | "Where are we and how's each phase landing?" Sold→Install track, dot per phase, variance chip per completed phase, "you are here" marker. |
| **Burn-up** (A) | "Are we tracking the plan over time?" Planned vs actual cumulative spend, today marker. |
| **Projection** (D) | "At this pace, where do we end up?" Stacked labour/material actual + dashed run-rate cone to install. |
| **Phase bars** (B) | "Which phase is bleeding margin?" Bar fills with actual, tick = budget, red = over. |
| **Pace + margin** (C) | "Are we making money — how much to claw back?" Gauge (budget used vs time elapsed) + projected-margin headline. |

**Always-visible in the tab header:** the projected-margin number + a "today" marker, regardless of active view.

**Below the chart:** a **phase table** (expandable to codes) — budget / actual / variance / variance % — and a **"Log actual cost"** button to record a material or sub invoice (`job_cost_actuals`).

## 7. P&L rollup

`/pnl` gains an **"Open jobs"** band above the portfolio chart:

- One row per in-flight job — quoted price · projected cost · **projected margin** · variance vs quote · colour band (on-track / at-risk / over).
- A single headline: **total margin at risk across open jobs** ("$X on the table to claw back").
- The month chart may render in-progress months' projected margin as a **dashed extension** of the booked (solid) series.

Reuses `computePnlStats`, extended to compute projected cost from each open job's budget + actuals. Revenue per job = Σ its invoices (= `Job.revenue` rollup, §4.8), so change-order revenue flows in automatically.

## 8. The math (defined)

Per phase, given `budget` (labour+material) and `actual` (labour+material+sub):

- A phase is **complete** when the job's `currentMilestone` is at or past that phase — milestones are realigned to the six phases 1:1 (**ADR 0008**), so the milestone _is_ the phase-complete signal; no separate toggle. A job reaching `pipelineStatus = complete` locks all phases.
- `projectedPhaseCost = complete ? actual : max(actual, budget)` — completed phases lock to actual; open phases assume you at least hit budget for remaining work, and overruns persist.
- For a **driven** code the open projection is **quantity-aware**: `actual + (budgeted_qty − done_qty) × current cost-per-unit`, where cost-per-unit comes from the session rate so far. So "18 of 40 sheets, running hot" projects the overrun *now*, instead of waiting for cost to cross budget. Flat codes use `max(actual, budget)`.
- `projectedJobCost = Σ projectedPhaseCost + overhead`
- `projectedMargin$ = revenue − projectedJobCost`
- `budgetedMargin$ = revenue − (Σ budget + overhead)`
- `clawback$ = max(0, budgetedMargin$ − projectedMargin$)` — dollars drifted from the bid.

**Phase → labour rate** (from the estimator's existing rules in `features/estimator/CLAUDE.md`; the three rates live in workspace settings):

| Phase | Rate |
| --- | --- |
| Design | `designRate` |
| CNC/Cut | `shopRate` |
| Assembly | `shopRate` |
| Finishing | `shopRate` |
| Delivery | `installRate` (travel-dominant; loading-at-shopRate nuance dropped at phase level) |
| Install | `installRate` |

**Burn-up baseline (v1):** the "plan" line is a **linear baseline** from job start (sold/created date) to `installDate`, scaled to total budget. A true dated schedule is a non-goal (see below). Actual line = cumulative incurred cost by session-end / actual date.

## 9. Non-goals (v1)

- **Per-employee breakdown** on the job — the `worker_id` seam exists; deferred to the shop employee time-tracker follow-on.
- **PO / invoice auto-import from Partners** — material/subtrade actuals are logged manually for now (the optional `partner_id` / `trade_line_id` links set up that future integration without building it).
- **Rewriting the estimator's pricing math** — the coded panel is additive/reconciled, not a replacement.
- **A true dated project schedule** for the burn-up plan line — v1 uses a linear/milestone baseline.
- **No Anthropic API spend** — pure CRUD + analytics, consistent with `/labour` (`billing-prefer-max-plan-over-api`). Any future AI insight runs off the Max plan.

## 10. Phasing (for the implementation plan)

- **P0 — Milestone realignment (ADR 0008).** `MilestoneStage` → the six phases; migration backfills `jobs.current_milestone`; update `MilestonesStrip`, `TasksTab` hints, `activity.ts`, seeds, briefing prompt, `createJobFromEstimate`. Prerequisite for the phase-complete signal.
- **P1 — Schema & types.** Migrations: `labour_operations.code` + `driver_unit`, `labour_sessions.quantity`, `cost_code_templates`(+items), `job_estimates`, `job_invoices`, `job_cost_budgets` (FK → estimate, + `budgeted_quantity`), `job_cost_actuals` (with `partner_id` / `trade_line_id`); migrate legacy `Job.invoice` → `job_invoices`; RLS; seeds; shared types.
- **P2 — Cost-code registry + templates in `/labour`.** Code field + phase framing + **driver-unit** per code in setup; **quantity prompt on timer Stop** for driven codes; task-template CRUD; computed historical-average exposure (per-unit for driven codes).
- **P3 — Estimator labour-codes panel.** Load template, auto-seed from cabinet summary, reconciliation note; write `job_cost_budgets` on _Save as Job_; section→phase material rollup; subtrade budget read from `job_trades.cost`.
- **P4 — Job Budget-vs-Actual tab.** Shared data layer (budget + actuals rollup, projected math) + views **E / B / C** + "Log actual cost" actuals logging.
- **P5 — Remaining views + P&L rollup.** Views **A / D**; `/pnl` open-jobs band + projected series.
- **P6 — Learning loop.** Historical averages feed estimator task-template defaults (approve-to-apply, generalizing today's cabinet-type nudge).

Each phase should leave the app green (`tsc` + `lint` + `build`) and be independently demoable.

## 11. Risks / open questions

- **Section→phase mapping (§5)** and **phase→rate mapping (§8)** are concrete defaults; confirm they match how Andrew thinks about material homes and labour rates (esp. Delivery's mixed rate). _(Reviewed in the 2026-06-20 grill; defaults stand.)_
- **Phase-complete signal** — resolved: milestones realign to the six phases 1:1 (ADR 0008), so `currentMilestone` is the signal.
- **Subtrade budget vs. actual** reconcile against `job_trades.cost` (ADR 0007's captured field): that field is the _budgeted_ subtrade cost; subtrade cost-actuals (kind `subtrade`, `trade_line_id`) track against it.
- **Reconciliation drift** between coded labour budget and quoted labour: surface as a warning, don't block save.

## 12. Glossary

- **Phase** — one of the 6 workflow stages (Design · CNC/Cut · Assembly · Finishing · Delivery · Install). The parent of cost codes; already `labour_categories`.
- **Cost code** — a labour operation under a phase, identified by `code`; the shared key across estimate, timer, and actuals.
- **Task template** — a named bundle of codes + budgeted minutes, loadable into an estimate.
- **Budget** — the per-code (labour) / per-phase (material) planned cost frozen on the job at _Save as Job_.
- **Actual** — incurred cost: labour from `labour_sessions`, material/sub from `job_cost_actuals`.
- **Projected margin** — revenue − projected cost, the live "are we making money" number.
- **Clawback** — dollars drifted below the bid you'd need to recover to hit quoted margin.
