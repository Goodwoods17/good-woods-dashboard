# Subtrade actuals (P4 / Slice C) — design

Date: 2026-06-23
Status: Approved (brainstorm 2026-06-23)
Builds on: ADR 0014 (Budget-vs-Actual / Slice D), ADR 0007 (subtrades & trade-lines),
ADR 0010 (QuickBooks-ready costing model)

## Goal

Close the last gap in the cost-codes stack (A registry → B timer→actuals →
**C subtrade actuals** → D the Budget-vs-Actual tab). Track what subtrades
*actually* cost vs their quoted cost, fold that drift into projected margin, and
drop the **"projected margin (excl. subtrade actuals)"** caveat that Slice D
ships with.

Answers: "the countertop sub billed $1,000 against an $800 quote — what does that
do to this job's margin, right now?"

## Key constraint discovered in the spike

**No migration is required.** `job_cost_actuals` already carries everything Slice C
needs (added with the cost-codes schema, ADR 0010):

```
kind text check (kind in ('material','subtrade','labour_adj'))
partner_id uuid          -- soft ref: a subtrades row when kind='subtrade'
trade_line_id uuid references job_trades(id) on delete set null
phase_id text references labour_categories(id)
actual_date date
amount numeric, note text
```

So the subtrade-actual row has a home today. ADR 0014's worry that "Slice C is the
schema-heavier slice" is moot: this is app-layer wiring — read + write + math + UI.
We deliberately do **not** add `job_trades.phase_id` (see Non-goals).

## Grain decision

**Per trade-line.** Each trade-line (Countertop, Electrical, …) shows its quoted
cost (`job_trades.cost`) vs the sum of actuals logged against it (via
`job_cost_actuals.trade_line_id`). Rejected alternatives: job-level-only (loses
"which sub overran"); per-phase (needs a `job_trades.phase_id` migration + tagging
UI, over-grained for the ~2–4 subs on a typical job).

## Architecture / data flow

```
job_trades (cost = budget, status)        ─┐
job_cost_actuals (kind='subtrade',         ├─► budgetVsActual.ts (pure)
                  trade_line_id, amount)   ─┘    rowsToSubtradeLines()
                                                 subtradeActualsByLine()
                                                 computeBudgetVsActual() → +subtradeDrift
                                                          │
                                       budgetVsActualStore.tsx (hook)
                                                          │
                                       BudgetVsActualTab.tsx + bva/ (UI)
                                          - Subtrades table (budget/actual/var per line)
                                          - "Log actual cost" modal: Material | Subtrade toggle
```

## 1. Pure data layer (`features/job-costing/lib/budgetVsActual.ts`)

New types:

```ts
export type SubtradeLine = {
  lineId: string;
  tradeName: string;          // resolved from trades registry
  subtradeName: string | null; // resolved from subtrades; null = TBD
  status: "needed" | "booked" | "done";
  budget: number;             // job_trades.cost (0 if null)
  actual: number;             // Σ subtrade actuals for this trade_line_id
  variance: number;           // actual − budget
  variancePct: number | null;
};
```

New mappers (pure, no React, no Set/Map spread — house style):
- `subtradeActualsByLine(actualRows)` → `Record<lineId, number>`: sums
  `amount` of rows where `kind === 'subtrade'`, grouped by `trade_line_id`.
  Rows with a null `trade_line_id` are summed into a `"__unassigned__"` bucket
  (shown as an "Unassigned" line so money is never silently dropped).
- `rowsToSubtradeLines(jobTrades, actualsByLine, tradeName, subtradeName)` →
  `SubtradeLine[]`, one per `job_trades` row (+ an Unassigned line if that bucket
  is non-zero).

`OtherCosts.subtrades` changes:

```ts
// before: { budget: number }
subtrades: {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  lines: SubtradeLine[];
};
```

`BvaInput` gains `subtradeLines: SubtradeLine[]` (replacing the bare
`subtradeBudget: number`; budget is derived as `Σ lines.budget`).

## 2. Margin math (mirrors materials, projected per line)

Each trade-line projects like a phase: a `done` line is locked to its actual; an
open (`needed`/`booked`) line projects to `max(actual, budget)` so an under-budget
open line contributes **zero** drift (consistent with materials' open-job rule).

```ts
function subtradeLineProjected(line: SubtradeLine, pipelineComplete: boolean): number {
  if (pipelineComplete || line.status === "done") return line.actual;
  return Math.max(line.actual, line.budget);
}

const subtradeProjected = Σ subtradeLineProjected(line);
const subtradeBudget    = Σ line.budget;
const subtradeDrift     = subtradeProjected − subtradeBudget;

projectedMargin = budgetedMargin − labourDrift − materialDrift − subtradeDrift;
clawback        = Math.max(0, labourDrift + materialDrift + subtradeDrift);
```

`BvaResult` gains `subtradeDrift: number` (alongside `labourDrift`,
`materialDrift`).

## 3. Store (`features/job-costing/lib/budgetVsActualStore.tsx`)

Two precise changes to the existing `Promise.all` fetch (verified against the
Slice D source, not assumed):

- **Load subtrade actuals.** The actuals query is currently
  `.from("job_cost_actuals").select("*").eq("job_id", jobId).eq("kind","material")`.
  **Drop the `.eq("kind","material")` filter** so both `material` and `subtrade`
  rows load in one query. The pure mappers split by kind internally
  (`materialActualTotal` already filters `kind==='material'`; the new
  `subtradeActualsByLine` filters `kind==='subtrade'`), so the material path is
  unchanged.
- **Resolve trade/subtrade names via a PostgREST embed**, not extra round-trips.
  Change the trade-lines query from `select("*")` to:

  ```ts
  sb.from("job_trades")
    .select("*, trades(label), subtrades(name)")
    .eq("job_id", jobId)
  ```

  `trades(label)` resolves the trade name; `subtrades(name)` resolves the subtrade
  (null when `subtrade_id` is null = TBD). One query, no new reads. (Embedding uses
  the FK targets `job_trades.trade_id → trades`, `job_trades.subtrade_id →
  subtrades`.)
- `BvaData` gains `subtradeLines: SubtradeLine[]` (replacing `subtradeBudget`),
  built by `rowsToSubtradeLines(trades.data, subtradeActualsByLine(actuals.data), …)`.
- `logActual` becomes a discriminated union. **The existing material variant keeps
  `phaseId`** (today's insert writes `phase_id: a.phaseId`):

```ts
type LogActualInput =
  | { kind: "material"; phaseId: MilestoneStage | null; amount: number;
      date?: string; note?: string }                                     // today's shape
  | { kind: "subtrade"; tradeLineId: string; partnerId: string | null;
      amount: number; date?: string; note?: string };
```

  Subtrade insert writes `{ job_id, kind:'subtrade', trade_line_id, partner_id,
  amount, actual_date, note }`; material insert is unchanged. `refresh()` after
  insert (existing behaviour).

## 4. UI (`features/job-costing/components/BudgetVsActualTab.tsx` + `bva/`)

- **Subtrades section** becomes a real table: one row per `SubtradeLine`
  (trade name · subtrade/​TBD · status chip · Budget · Actual · Variance · Var%),
  plus a total row. Replaces the `actuals tracked later` stub
  (`BudgetVsActualTab.tsx:443`). Styling matches the existing Materials/Labour
  tables (tokens, no hardcoded values).
- **"Log actual cost" modal** gains a **Material | Subtrade** segmented toggle.
  Selecting Subtrade reveals a required **trade-line** dropdown (this job's
  trade-lines, label = trade name + subtrade/​TBD); `partner_id` is taken from the
  chosen line's `subtrade_id`. Amount / date / note unchanged. Default toggle =
  Material (preserves today's one-click material flow).
- **Header label** at `BudgetVsActualTab.tsx:138` — remove
  `projected margin (excl. subtrade actuals)`; subtrade drift now flows through the
  headline + Clawback, so the headline reads `projected margin` plainly.

## Definition of Done (acceptance checks → step-7 smoke script)

Smoke uses `scripts/seed-bva-smoke.ts 2` (already seeds an $800 Countertop
trade-line) + the authed smoke user.

1. **Caveat gone.** *Given* a seeded job with an $800 Countertop trade-line and no
   subtrade actuals, *when* I open Budget vs Actual, *then* the Subtrades table
   shows Countertop Budget $800 / Actual $0 / Var —, and the headline reads
   "projected margin" with **no** "(excl. subtrade actuals)".
2. **Log → variance + clawback.** *Given* I click "Log actual cost", choose
   Subtrade → Countertop, enter $1,000, *when* it saves, *then* the Countertop row
   shows Actual $1,000 / Variance +$200, and Clawback rises by $200 (margin drops
   by $200).
3. **Done locks projection.** *Given* the Countertop line `status='done'` with
   $1,000 actual, *then* its projection = $1,000 (not `max(actual, budget)`); a
   later under-budget edit would not un-book the overrun differently than an open
   line.
4. **Open under-budget = zero drift.** *Given* an open (`needed`/`booked`)
   trade-line with actual < budget, *then* it contributes $0 to `subtradeDrift`
   (projected = budget), mirroring materials.
5. **Totals sum.** *Given* two trade-lines, *then* the Subtrades total row equals
   the sum of their budgets and the sum of their actuals, and `subtradeDrift` =
   Σ per-line projected − Σ per-line budget.
6. **Unassigned never lost.** *Given* a `kind='subtrade'` actual with null
   `trade_line_id`, *then* it appears in an "Unassigned" line and is included in the
   Subtrades total (not silently dropped).

## Non-goals (YAGNI)

- **No `job_trades.phase_id` / per-phase subtrade grouping.** Per-trade-line is the
  agreed grain.
- **No trade-line schedule dates** (the ADR 0014 "schedule dates" aside is P5).
- **No new subtrade-actual edit/delete UI** beyond parity with the existing
  material-actual affordances.
- **No QuickBooks export wiring** here (the row already maps to a QB Bill per ADR
  0010; export is its own future slice).

## ADR / docs follow-up

ADR 0014 says the "(excl. subtrade actuals)" label "drops then [Slice C]" and that
Slice C "likely [an] ADR 0007 amendment." Since we add **no** `job_trades.phase_id`
and no schedule dates, ADR 0007 needs no amendment. Add a short **ADR 0014 addendum**
(or ADR 0015) recording: subtrade actuals shipped at per-trade-line grain, no
migration, label dropped, margin now all-in. Update `docs/domain.md` if "subtrade
actual" / "trade-line variance" want glossary entries. Update `docs/roadmap.md`
(cost-codes stack A–D + C now complete).
