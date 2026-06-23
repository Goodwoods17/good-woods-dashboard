# Budget-vs-Actual (P4 / Slice D, labour + materials) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Budget vs Actual" tab on `/jobs/[id]` that shows, mid-job, whether a job is making money — per-phase/per-code **labour** variance (budget vs live timer actuals), a **job-level** Materials/Subtrades/Overhead panel, and an anchored projected-margin + clawback header, across three switchable views (Timeline, Phase bars, Pace+margin) with a "Log actual cost" button.

**Architecture:** A **pure data layer** (`features/job-costing/lib/budgetVsActual.ts`) computes the rollup + margin math from plain inputs. A **loader hook** (`useBudgetVsActual(jobId)`) reads the rows (labour budget, labour sessions, material actuals, subtrade budget) and the tab combines them with job-level figures (materials budget, overhead, quoted margin) from the `Job`. The **`BudgetVsActualTab`** renders the header, a view switcher (recharts mirrored from `features/pnl/components/MarginChart.tsx`), the per-phase labour table, the job-level Other-costs panel, and an inline "Log actual cost" form writing `job_cost_actuals`.

**Tech Stack:** Next.js 14 / React 18 / TS strict · Supabase (`@supabase/ssr`, dual-mode like existing stores) · recharts · Tailwind tokens · `tsx` + `node:assert/strict` tests.

**Design source:** ADR 0014 (this slice's scope + margin semantics) · design doc `docs/superpowers/specs/2026-06-22-cost-code-registry-and-p4-stack-design.md` §6/§8 · glossary `docs/domain.md` (Projected margin, Clawback, Budget, Cost-actual).

**Scope:** per-phase/per-code **labour** variance + **job-level** Materials (budget vs logged actuals) + Subtrades (budget only) + Overhead (silent constant) + anchored projected-margin/clawback header + views **E (Timeline) / B (Phase bars) / C (Pace+margin)** + "Log actual cost" (material). **Deferred (ADR 0014):** subtrade _actuals_ + per-phase subtrade variance (Slice C); Burn-up (A) + Projection (D) views + `/pnl` rollup (P5); learning loop (P6).

## Definition of Done (acceptance checks — the step-by-step smoke script)

1. **Given** a job created via the estimator (has `job_cost_budgets` labour rows), **when** I open its "Budget vs Actual" tab, **then** the header shows a projected margin equal to the job's quoted margin (no actuals yet) and the per-phase labour table lists each phase with budget = budgeted_amount, actual = 0.
2. **Given** that job has logged labour sessions on a phase's code (timer), **when** I open the tab, **then** that code's actual-$ = session-minutes/60 × the budget row's snapshot rate, the phase rolls it up, and projected margin drops by any overrun.
3. **Given** I click "Log actual cost" and enter a material amount, **when** I submit, **then** a `job_cost_actuals` material row is written and the Materials line (job-level) shows budget vs that actual + variance, and the header margin/clawback update.
4. **Given** the job's `currentMilestone` is past a phase, **when** I view that phase, **then** it reads "complete" and its projected = actual (locked); open phases project `max(actual, budget)`.
5. **Given** the job has subtrade budget (`job_trades.cost`), **when** I view the header, **then** it is labelled "(excl. subtrade actuals)" and the Other-costs panel shows the subtrade budget with actuals marked not-yet-tracked.
6. **Given** I switch between Timeline / Phase bars / Pace+margin, **when** each renders, **then** the projected-margin + clawback header stays visible and consistent across all three.
7. **Given** a job with **no** budget (e.g. a seed job), **when** I open the tab, **then** I get a clean empty state pointing to the estimator (no crash).

## Global Constraints

- Path aliases `@features/*`, `@shared/*`; TS strict. No `Set`/`Map` spread, no `for…of` over a `Set` (iterate arrays / `Array.from(map.values())`).
- Tailwind design tokens only (`bg-surface`, `bg-surface-muted`, `border-border`, `text-text-{primary,secondary,tertiary}`, `status-{blocked,at-risk,on-track}` + `-soft`, `shadow-resting`, `rounded-{lg,xl,2xl}`, `duration-fast`). No hardcoded hex.
- **Money always via `formatCAD`** from `@shared/lib/format`. Never hand-roll currency.
- **`PhaseId` === `MilestoneStage`** (6 keys). Phase labels from `MILESTONE_STAGES` (`@shared/lib/types`); `PHASE_ORDER`/`rateForPhase` from `@features/job-costing/lib/costCodes`.
- **Verified data facts (spiked 2026-06-23 — do NOT re-derive or doubt):**
  - `job_cost_budgets` (text `job_id`, text `phase_id`, uuid `code_id`, `kind` — **only `labour` rows are written**, `budgeted_minutes`, `budgeted_quantity`, numeric `rate` = snapshot, `budgeted_amount`, `room_label`).
  - `labour_sessions` (text `job_id` = **joins to `jobs.id` directly, NO uuid seam**, uuid `operation_id` = budget `code_id`, text `category_id` = phase, numeric `accumulated_ms`, numeric `quantity`, `ended_at` null = running → skip).
  - `job_cost_actuals` (text `job_id`, text `kind` — use `material`, text `phase_id`, numeric `amount`, text `note`, uuid `code_id`). Table + RLS already exist.
  - `job_trades` (text `job_id`, numeric `cost` = subtrade budget; **no `phase_id`** → subtrade budget is job-level this slice).
  - **Material budget + overhead come from the `Job`**, not these tables: `job.costLines` (category materials → materials budget; category overhead → overhead). Quoted margin = the job's existing margin (`computeMargin(job)` / `revenue − costsTotal`).
- **Margin math (ADR 0014):** anchor to the quoted margin and move only by tracked drift. `budgetedMargin = quotedMargin`; `projectedMargin = budgetedMargin − labourDrift − materialDrift`; `clawback = max(0, labourDrift + materialDrift)`. Overhead + subtrade budget never enter drift (no actuals) → they cancel. Labour actual-$ uses the budget row's **snapshot rate**.
- **Phase complete = `pipelineComplete || PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(currentMilestone)`** (current phase is in-progress, not complete).
- Dual-mode: Supabase when configured, else empty arrays (empty state) — mirror the read pattern of `features/job-costing/lib/saveBudget.ts` (`hasSupabase()`/`getSupabase()`) + `features/labour/lib/labourStore.tsx`.
- RLS authenticated-only on the `job_cost_actuals` write (reuse the existing policy). No Anthropic API spend.
- Per-task gate: `npx tsc --noEmit` clean + the task's tsx test green + `npx prettier --write` on touched files. Full gate (`lint`, `build`, browser smoke) at the final task.
- Commit after each task; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Don't push mid-build.

---

### Task 1: Pure data layer + margin math (`budgetVsActual.ts`)

**Files:** Create `features/job-costing/lib/budgetVsActual.ts`, `scripts/test-budget-vs-actual.ts`.

**Interfaces — Produces:**

```ts
import type { MilestoneStage } from "@shared/lib/types";
export type BudgetLine = {
  phaseId: MilestoneStage;
  codeId: string | null;
  codeName: string;
  budgetedMinutes: number;
  budgetedQuantity: number | null;
  rate: number;
  budgetedAmount: number;
};
export type LabourActual = {
  phaseId: MilestoneStage;
  codeId: string | null;
  minutes: number;
  quantity: number | null;
};
export type BvaInput = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsBudget: number; // job-level (costLines materials)
  materialsActual: number; // Σ job_cost_actuals(material)
  subtradeBudget: number; // Σ job_trades.cost
  overhead: number; // costLines overhead (silent constant)
  quotedMargin: number; // revenue − costsTotal (the Pipeline number)
  currentMilestone: MilestoneStage;
  pipelineComplete: boolean;
};
export type CodeRow = {
  codeId: string | null;
  codeName: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
};
export type PhaseRollup = {
  phaseId: MilestoneStage;
  label: string;
  complete: boolean;
  budget: number;
  actual: number;
  projected: number;
  variance: number;
  variancePct: number | null;
  codes: CodeRow[];
};
export type OtherCosts = {
  materials: { budget: number; actual: number; variance: number; variancePct: number | null };
  subtrades: { budget: number };
  overhead: number;
};
export type BvaResult = {
  phases: PhaseRollup[];
  other: OtherCosts;
  labourDrift: number;
  materialDrift: number;
  budgetedMargin: number;
  projectedMargin: number;
  clawback: number;
  totalLabourBudget: number;
  totalLabourActual: number;
};
export function phaseComplete(
  phase: MilestoneStage,
  currentMilestone: MilestoneStage,
  pipelineComplete: boolean
): boolean;
export function labourActualAmount(rate: number, minutes: number): number; // minutes/60 * rate
export function projectedPhaseCost(
  complete: boolean,
  actual: number,
  budget: number,
  drivenOpen?: { budgetedQty: number; doneQty: number; costPerUnit: number }
): number;
export function marginTone(
  clawback: number,
  budgetedMargin: number
): "on_track" | "at_risk" | "blocked";
export function computeBudgetVsActual(input: BvaInput): BvaResult;
```

- [ ] **Step 1: Write the failing test** `scripts/test-budget-vs-actual.ts` (harness style of `scripts/test-job-blockers.ts`). Assert with fixed numbers:
  - `phaseComplete`: `cnc` complete when current=`assembly`; `assembly` not complete when current=`cnc`; all complete when `pipelineComplete`.
  - `labourActualAmount(50, 90)` → `75`.
  - `projectedPhaseCost`: complete (actual 80, budget 100) → 80; open flat (40,100)→100 and (130,100)→130; open driven `{budgetedQty:40,doneQty:18,costPerUnit:5}` actual 90 → `90 + 22*5 = 200`.
  - `marginTone`: clawback 0 → `on_track`; clawback 500 of budgetedMargin 10000 → `at_risk`; clawback 2000 of 10000 (>10%) → `blocked`.
  - `computeBudgetVsActual` on a fixture: 2 phases (design complete + cnc open), one labour code each (design: budget 100/actual 80; cnc: budget 200/actual 0), `materialsBudget 2000`/`materialsActual 1500`, `subtradeBudget 800`, `overhead 300`, `quotedMargin 10000`, current=`cnc`, not complete. Assert: design phase projected 80 (complete→actual); cnc projected 200 (open→max(0,200)); `labourDrift = (80+200)-(100+200) = -20`; `materialDrift = max(1500,2000)-2000 = 0`; `budgetedMargin 10000`; `projectedMargin = 10000 - (-20) - 0 = 10020`; `clawback = max(0, -20+0) = 0`; `other.materials.variance = 1500-2000 = -500`; `other.subtrades.budget 800`; `other.overhead 300`. (Note overhead/subtrade absent from drift.) Add a second fixture where cnc actual=260 (overrun) → labourDrift = +60 → projectedMargin 9940 → clawback 60.
  - `variancePct` null when budget 0, else round1(variance/budget\*100).

- [ ] **Step 2: Run → fails.** **Step 3: Implement** (pure; imports only `MilestoneStage`/`MILESTONE_STAGES` from `@shared/lib/types`, `PHASE_ORDER` from `@features/job-costing/lib/costCodes`). Group labour budget+actuals by phase then code (Map; iterate via `Array.from(map.values())`); labour actual code-$ = `labourActualAmount(rate, Σ minutes for that code)`; phase budget/actual = Σ of its code rows; `projected` per `projectedPhaseCost` (driven when the budget line has `budgetedQuantity != null` and sessions carry quantity — costPerUnit = actual$/doneQty so far, guard doneQty 0 → treat as flat); `labourDrift = Σ projected − Σ budget`; material projected = `pipelineComplete ? materialsActual : max(materialsActual, materialsBudget)`, `materialDrift = materialProjected − materialsBudget`; margins + clawback + tone per the constraints.
- [ ] **Step 4: Run → passes; tsc clean; prettier.** **Step 5: Commit** — `feat(job-costing): pure budget-vs-actual data layer + anchored margin math (P4)`.

---

### Task 2: Row→input mapping (pure) + test

**Files:** Modify `features/job-costing/lib/budgetVsActual.ts` (add mapping); Modify `scripts/test-budget-vs-actual.ts` (add a section) or create `scripts/test-bva-mapping.ts`.

**Interfaces — Produces:**

```ts
export function rowsToLabourBudget(
  rows: Record<string, unknown>[],
  codeName: (codeId: string) => string | undefined
): BudgetLine[];
export function sessionsToLabourActuals(rows: Record<string, unknown>[]): LabourActual[]; // group by category_id+operation_id; minutes = Σ accumulated_ms/60000 (skip ended_at null); quantity = Σ quantity
export function materialActualTotal(rows: Record<string, unknown>[]): number; // Σ amount where kind='material'
export function subtradeBudgetTotal(rows: Record<string, unknown>[]): number; // Σ cost
```

- [ ] **Step 1: Failing test** feeding snake_case rows: a budget row (`phase_id:"design", code_id:"u1", kind:"labour", budgeted_minutes:120, rate:50, budgeted_amount:100, budgeted_quantity:null`); two sessions for `category_id:"design"/operation_id:"u1"` with `accumulated_ms` 3_600_000 + 1_800_000 (=90 min) one with `ended_at:null` (skipped); a material actual `{kind:"material", amount:1500}` + a non-material row (ignored); two job_trades `{cost:500}`+`{cost:300}`. Assert `rowsToLabourBudget` → one `BudgetLine` (codeName resolved); `sessionsToLabourActuals` → `[{phaseId:"design",codeId:"u1",minutes:90,quantity:…}]`; `materialActualTotal` → 1500; `subtradeBudgetTotal` → 800. Then feed into `computeBudgetVsActual` and assert the labour actual-$ = 75.
- [ ] **Step 2: Run → fails; implement the four pure mappers; run → passes.** tsc clean; prettier. Commit — `feat(job-costing): row→input mappers for budget-vs-actual (P4)`.

---

### Task 3: Loader hook `useBudgetVsActual(jobId)`

**Files:** Create `features/job-costing/lib/budgetVsActualStore.tsx` (a per-job loader hook, not a provider). Patterns: `saveBudget.ts` (`hasSupabase`/`getSupabase`), `labourStore.tsx`, `jobBlockersStore.tsx` (`formatError`).

**Interfaces — Produces:**

```ts
export function useBudgetVsActual(jobId: string): {
  data: {
    labourBudget: BudgetLine[];
    labourActuals: LabourActual[];
    materialsActual: number;
    subtradeBudget: number;
  } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logActual: (a: { amount: number; phaseId: MilestoneStage | null; note: string }) => Promise<void>;
};
```

(The tab supplies `materialsBudget`, `overhead`, `quotedMargin`, `currentMilestone`, `pipelineComplete` from the `Job`.)

- [ ] **Step 1: Implement** — when `hasSupabase()`, on mount + `refresh` run reads (use the mappers from Task 2):
  - `job_cost_budgets` where `job_id = jobId` and `kind = 'labour'` → `rowsToLabourBudget` (resolve `codeName` from a `labour_operations` id→code/name map fetched alongside, or null).
  - `labour_sessions` where `job_id = jobId` (text eq — clean) → `sessionsToLabourActuals`. Map each `category_id` to a `MilestoneStage` (it already is one of the 6 keys).
  - `job_cost_actuals` where `job_id = jobId` and `kind = 'material'` → `materialActualTotal`.
  - `job_trades` where `job_id = jobId` → `subtradeBudgetTotal`.
  - When `!hasSupabase()` → `data` with empty arrays / zeros (empty state).
- [ ] **Step 2: `logActual`** — insert `job_cost_actuals` `{ job_id: jobId, kind:'material', phase_id: a.phaseId, amount: a.amount, note: a.note }`; on success `await refresh()`; errors via `formatError`. Reuse existing RLS.
- [ ] **Step 3:** tsc clean; prettier. (No tsx test — IO glue; math covered by T1/T2.) Commit — `feat(job-costing): budget-vs-actual loader hook + logActual (P4)`.

---

### Task 4: `BudgetVsActualTab` + wire into JobDetail (tracer-bullet — demoable end-to-end here)

**Files:** Create `features/job-costing/components/BudgetVsActualTab.tsx`; Modify `features/jobs/components/JobDetail.tsx` (add the tab now, so the thin path is live by this task). Mirror: `CostsTab.tsx` body, the Pipeline view-switcher idiom, card idiom `rounded-xl bg-surface shadow-resting p-6`, `BlockersCard.tsx` inline-form pattern (for Task 8). Money via `formatCAD`.

**Interfaces — Produces:** `export function BudgetVsActualTab({ job }: { job: Job })`.

- [ ] **Step 1: Build the shell** (`"use client"`): `const { data, loading, logActual } = useBudgetVsActual(job.id);` Derive from `job`: `materialsBudget = Σ costLines(materials).amount`, `overhead = Σ costLines(overhead).amount`, `quotedMargin = computeMargin(job).margin$` (confirm the exact field from `features/jobs/lib/...`), `currentMilestone`, `pipelineComplete = job.pipelineStatus === "complete"`. Compute `const bva = computeBudgetVsActual({ ...data, materialsBudget, overhead, quotedMargin, currentMilestone, pipelineComplete });` when `data`.
  - **Header (always visible):** `formatCAD(bva.projectedMargin)` + tone chip from `marginTone(bva.clawback, bva.budgetedMargin)` (`status-on-track`/`-at-risk`/`-blocked` soft tokens), clawback line `formatCAD(bva.clawback)` when > 0, and the literal label **"projected margin (excl. subtrade actuals)"**.
  - **View switcher:** `useState<"timeline"|"bars"|"pace">("timeline")`, 3 buttons; render placeholders for the views now (Tasks 5–7).
  - **Per-phase labour table:** map `bva.phases` (label, budget/actual/variance `formatCAD`, variance% or "—", complete/open chip), each expandable (expanded phaseIds as `string[]` state — no Set) to its `codes`.
  - **Other-costs panel:** Materials (budget/actual/variance via `bva.other.materials`), Subtrades (`bva.other.subtrades.budget` + "actuals tracked later"), Overhead (`formatCAD(bva.other.overhead)`, "fixed"). Tokens; ≥44px targets.
  - **Empty/loading state:** loading → "Loading…"; `data` with empty `labourBudget` → "No budget for this job yet. Build it in the Estimator (Save as Job)." (link `/estimator`).
- [ ] **Step 2: Wire into JobDetail** — extend `TabKey` with `"budget"`, add `{ key:"budget", label:"Budget vs Actual", enabled:true }` to `TABS` after "costs", render `{activeTab === "budget" && <BudgetVsActualTab job={job} />}`. Keep JobDetail thin.
- [ ] **Step 3:** tsc clean; prettier. Commit — `feat(job-costing): Budget-vs-Actual tab shell + header + tables, wired into JobDetail (P4)`.

---

### Task 5: View E — Timeline lane (default)

**Files:** Create `features/job-costing/components/bva/TimelineView.tsx`; Modify `BudgetVsActualTab.tsx`.

- [ ] **Step 1:** `TimelineView({ bva, job })` — Sold→Install lane, one dot per phase (`PHASE_ORDER`, `MILESTONE_STAGES` labels), a variance chip on completed phases (`formatCAD(phase.variance)`, tone by sign), muted dot for open phases, "you are here" on `job.currentMilestone`. Pure CSS/flex, tokens only.
- [ ] **Step 2:** tsc clean; prettier. Commit — `feat(job-costing): P4 Timeline view (E)`.

---

### Task 6: View B — Phase bars

**Files:** Create `features/job-costing/components/bva/PhaseBarsView.tsx`; Modify `BudgetVsActualTab.tsx`.

- [ ] **Step 1:** `PhaseBarsView({ bva })` — one bar per phase: fill = actual, tick at budget, `status-blocked` when actual > budget else `status-on-track`; label + `formatCAD`. recharts (mirror `MarginChart.tsx`) or CSS bars; tokens, no hex.
- [ ] **Step 2:** tsc clean; prettier. Commit — `feat(job-costing): P4 Phase-bars view (B)`.

---

### Task 7: View C — Pace + margin

**Files:** Create `features/job-costing/components/bva/PaceMarginView.tsx`; Modify `BudgetVsActualTab.tsx`.

- [ ] **Step 1:** `PaceMarginView({ bva, job })` — gauge of budget-used (`totalLabourActual + materialsActual` vs `totalLabourBudget + materialsBudget`) vs time-elapsed (`clamp01((today − soldDate)/(installDate − soldDate))`, guard missing/zero span → "—") + the projected-margin headline (`formatCAD(bva.projectedMargin)`) reusing `marginTone`. Tokens.
- [ ] **Step 2:** tsc clean; prettier. Commit — `feat(job-costing): P4 Pace+margin view (C)`.

---

### Task 8: "Log actual cost" inline form (material actuals)

**Files:** Modify `BudgetVsActualTab.tsx` (uses `logActual` from Task 3).

- [ ] **Step 1:** Inline reveal form (mirror `BlockersCard.tsx` — no `window.*`, no native modal): amount (number, required >0), phase `<select>` of `MILESTONE_STAGES` + "Whole job" (null), note. Submit → `await logActual({ amount, phaseId, note })` → reset + collapse (loader's `refresh` updates header + Materials line). Validate amount; disable until valid; ≥44px; `aria-label`s; tokens.
- [ ] **Step 2:** tsc clean; prettier. Commit — `feat(job-costing): log material actuals from the Budget-vs-Actual tab (P4)`.

---

### Task 9: Full gate + docs + smoke + retro

**Files:** Modify `features/job-costing/CLAUDE.md`; create `scripts/seed-bva-smoke.ts` (reusable smoke fixture — retro item); update `.superpowers/sdd/progress.md`.

- [ ] **Step 1: Full gate** — `tsc` clean; `npm run lint` clean; tsx suites green (`test-budget-vs-actual` + mapping + pre-existing unaffected); `npm run build` OK; `prettier --check` clean on all files this branch touched.
- [ ] **Step 2: Docs** — document the tab in `features/job-costing/CLAUDE.md` (data layer, anchored-margin math, per-phase-labour/job-level-others structure, the 3 views, Log-actual, deferred items, link ADR 0014); **correct the stale `labour_sessions.job_id uuid` note to `text`** (retro).
- [ ] **Step 3: Smoke seed helper** `scripts/seed-bva-smoke.ts` (reusable; retro): given a jobId, insert a `job_estimates` + a few `job_cost_budgets` labour rows + a couple of `labour_sessions` + a `job_cost_actuals` material row (and a `job_trades` cost), and a `--clean` flag to delete them. Used by the smoke; reused next slice.
- [ ] **Step 4: Authenticated browser smoke** (dev on 3000; `scripts/reset-smoke-user.ts`; seed an example job via `seed-bva-smoke.ts`): run **all 7 Definition-of-Done checks** above. Clean up seed rows. Screenshot.
- [ ] **Step 5: Retro** — append to `.superpowers/sdd/progress.md` what the slice caught + hardened (reusable smoke seed shipped; stale uuid doc fixed; any new eslint/CLAUDE gotcha).
- [ ] **Step 6: Commit** — `feat(job-costing): Budget-vs-Actual tab (P4) — gate green + smoke + docs`.

---

## Self-Review

**Spec coverage (ADR 0014 / design §6,§8):** anchored margin + clawback + drift (T1) ✓; snapshot-rate labour actual (T1/T2) ✓; phase-complete=milestone + projected (flat+driven) (T1) ✓; row mappers + clean text job_id join (T2/T3) ✓; loader + logActual (T3) ✓; header + per-phase labour table + job-level Other-costs panel + empty state, wired into JobDetail (T4) ✓; views E/B/C (T5–T7) ✓; Log actual cost (T8) ✓; gate/docs/smoke(DoD)/retro (T9) ✓. **Deferred (ADR 0014):** subtrade actuals (C), Burn-up/Projection + /pnl (P5), learning loop (P6).

**Placeholder scan:** T1/T2 carry exact signatures + numeric fixtures (incl. an overrun case proving clawback); T3 carries the exact reads + the resolved (text) join; UI tasks give structure + consumed APIs + components to mirror.

**Type consistency:** `BudgetLine`/`LabourActual`/`BvaInput`/`PhaseRollup`/`OtherCosts`/`BvaResult` defined once in T1, consumed unchanged downstream; `computeBudgetVsActual`/`marginTone`/`rowsToLabourBudget`/`sessionsToLabourActuals`/`materialActualTotal`/`subtradeBudgetTotal`/`useBudgetVsActual` names stable; `MilestoneStage` for all phase keys.

**Tracer-bullet:** riskiest unknown (data attribution / margin baseline) spiked + resolved pre-plan; the tab is wired into JobDetail in T4 so a thin end-to-end path is demoable by task 4, then views thicken it.

**Verify-at-build (small, named):** exact `computeMargin` return field for quoted margin (T4); `costLines` category spelling `material(s)`/`overhead` (T4); `MarginChart` recharts setup to mirror (T6); `job.soldAt`/created date + `installDate` field names for the pace gauge (T7).
