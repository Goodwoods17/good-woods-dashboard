# Subtrade Actuals (P4 / Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track subtrade actual cost vs quoted cost per trade-line in the Budget-vs-Actual tab, fold subtrade drift into projected margin, and drop the "(excl. subtrade actuals)" caveat.

**Architecture:** Pure data layer (`budgetVsActual.ts`) gains subtrade types, mappers, and per-line drift in `computeBudgetVsActual`. The store (`budgetVsActualStore.tsx`) loads subtrade actuals (drop the `kind='material'` filter) and resolves trade/subtrade names via a PostgREST embed. The tab renders a per-line Subtrades table and a Material|Subtrade toggle in the log-actual modal. **No migration** — `job_cost_actuals` already supports `kind='subtrade'` with `trade_line_id`.

**Tech Stack:** Next.js 14 / React 18 / TypeScript (strict), Supabase (`@supabase/ssr`), Tailwind design tokens, lucide-react.

## Global Constraints

- **Testing (Andrew-approved 2026-06-23):** add **Vitest** for the pure logic layer (the money math), broad on *logic* (not jsdom component tests). Verification = `npm test` (Vitest) for the math + `npx tsc --noEmit` + `npm run lint` + `npm run build` + an authed **Playwright** browser smoke against the DoD for the feature/wiring. Task 0 sets up Vitest and ports Slice D's hand-rolled `scripts/test-budget-vs-actual.ts` into it; Task 1 is real test-first TDD on the subtrade math.
- **No migration.** `job_cost_actuals` already has `kind='subtrade'`, `trade_line_id`, `partner_id`, `phase_id`, `actual_date`.
- **House style for the pure layer:** no React, no `Set`/`Map` spread, pure functions only (file header rule in `budgetVsActual.ts`).
- **Money:** format with `formatCAD` from `@shared/lib/format`. Never hand-roll currency.
- **Styling:** Tailwind design tokens only (`docs/DESIGN.md`); match the existing Materials/Labour tables in `BudgetVsActualTab.tsx`. No hardcoded hex/spacing.
- **Import boundaries:** `@/*`, `@features/*`, `@shared/*` — no deep relative imports.
- **Domain terms:** trade-line, subtrade, phase, clawback, projected margin (see `docs/domain.md`).

## Execution precondition

This branch (`feat/subtrade-actuals`) is cut from main **before** PR #15 (Slice D) merged, so the Slice D files do not yet exist here. **Before Task 1:** merge #15 to main, then `git fetch && git rebase origin/main` onto this branch so `budgetVsActual.ts`, `budgetVsActualStore.tsx`, `BudgetVsActualTab.tsx` (+ `bva/`) are present. Do not start coding until `features/job-costing/lib/budgetVsActual.ts` exists on this branch.

## File structure

- **Modify** `features/job-costing/lib/budgetVsActual.ts` — types, mappers, `computeBudgetVsActual` (Task 1).
- **Modify** `features/job-costing/lib/budgetVsActualStore.tsx` — fetch + `logActual` union (Task 2).
- **Modify** `features/job-costing/components/BudgetVsActualTab.tsx` and files under `features/job-costing/components/bva/` — Subtrades table, log modal toggle, drop label (Task 3).
- **Create/modify** `docs/decisions/0015-subtrade-actuals-per-line.md`, `docs/domain.md`, `docs/roadmap.md`, `features/job-costing/CLAUDE.md` (Task 4).

---

### Task 0: Set up Vitest + port the existing math harness

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `vitest.config.ts`
- Create: `features/job-costing/lib/budgetVsActual.test.ts`
- Delete: `scripts/test-budget-vs-actual.ts` (ported into the Vitest file)

**Why:** Slice D shipped a comprehensive hand-rolled assertion harness for the margin math. Upgrade it to Vitest (watch mode, real diffs, `npm test`, the tool Andrew approved) and make `npm test` the math gate going forward. Set the config up **broad on logic** so any `*.test.ts` under `features/`/`shared/` is picked up — other logic files can be backfilled later (cheap follow-up).

- [ ] **Step 1: Add Vitest + tsconfig-paths resolver.**

```bash
npm install -D vitest vite-tsconfig-paths
```

(`vite-tsconfig-paths` lets Vitest resolve the `@features`/`@shared` aliases that the pure files import, reusing `tsconfig.json` paths — no duplicate alias config. Type-only `@shared` imports are erased at runtime; `@features/.../costCodes` is a real value import that needs this.)

- [ ] **Step 2: Add test scripts to `package.json`.**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`.**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["features/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Port the harness into `features/job-costing/lib/budgetVsActual.test.ts`.**

Translate every case in `scripts/test-budget-vs-actual.ts` to Vitest. Imports become local (`from "./budgetVsActual"`). Pattern: `check("x", () => { assert.equal(a, b) })` → `it("x", () => { expect(a).toBe(b) })`; wrap groups in `describe(...)`. Use the file header:

```ts
import { describe, it, expect } from "vitest";
import type { BvaInput, BvaResult } from "./budgetVsActual";
import {
  phaseComplete, labourActualAmount, projectedPhaseCost, marginTone,
  computeBudgetVsActual, rowsToLabourBudget, sessionsToLabourActuals,
  materialActualTotal, subtradeBudgetTotal,
} from "./budgetVsActual";
```

Port ALL existing assertions verbatim (same inputs/expected values) — they are the regression net for the existing labour/material math.

- [ ] **Step 5: Delete the old harness.**

```bash
git rm scripts/test-budget-vs-actual.ts
```

- [ ] **Step 6: Run the suite green.**

Run: `npm test`
Expected: all ported cases PASS (same numbers as the old harness printed).

- [ ] **Step 7: Commit.**

```bash
git add package.json package-lock.json vitest.config.ts features/job-costing/lib/budgetVsActual.test.ts
git commit -m "test(job-costing): add Vitest; port BVA math harness from tsx script (Slice C)"
```

---

### Task 1: Pure data layer — subtrade types, mappers, per-line drift

**Files:**
- Modify: `features/job-costing/lib/budgetVsActual.ts`

**Interfaces:**
- Consumes: existing `variancePct(variance, budget)`, `round1`, `BvaInput`, `OtherCosts`, `BvaResult`, `computeBudgetVsActual`.
- Produces (later tasks rely on these exact names/types):
  - `type SubtradeLine = { lineId: string; tradeName: string; subtradeName: string | null; status: "needed"|"booked"|"done"; budget: number; actual: number; variance: number; variancePct: number | null }`
  - `subtradeActualsByLine(rows: Record<string, unknown>[]): Record<string, number>`
  - `rowsToSubtradeLines(jobTrades: Record<string, unknown>[], actualsByLine: Record<string, number>, tradeName: (id: string) => string | undefined, subtradeName: (id: string) => string | undefined): SubtradeLine[]`
  - `BvaInput.subtradeLines: SubtradeLine[]` (replaces `subtradeBudget: number`)
  - `OtherCosts.subtrades: { budget: number; actual: number; variance: number; variancePct: number | null; lines: SubtradeLine[] }`
  - `BvaResult.subtradeDrift: number`

- [ ] **Step 0 (TDD — write failing tests first): add subtrade cases to `budgetVsActual.test.ts`.**

Append these to the Vitest file from Task 0. They reference symbols this task will create, so they fail to compile/run until the implementation lands (that is the red state).

```ts
import {
  subtradeActualsByLine, rowsToSubtradeLines, subtradeLineProjected,
  UNASSIGNED_LINE, type SubtradeLine,
} from "./budgetVsActual";

describe("subtrade actuals (Slice C)", () => {
  const tradeRows = [
    { id: "L1", trade_id: "t-counter", subtrade_id: "s-stone", status: "booked", cost: 800 },
    { id: "L2", trade_id: "t-elec", subtrade_id: null, status: "needed", cost: 600 },
  ];
  const tradeName = (id: string) => ({ "t-counter": "Countertop", "t-elec": "Electrical" }[id]);
  const subName = (id: string) => ({ "s-stone": "Stoneworks" }[id]);

  it("subtradeActualsByLine sums kind='subtrade' by trade_line_id; null → UNASSIGNED", () => {
    const rows = [
      { kind: "subtrade", trade_line_id: "L1", amount: 600 },
      { kind: "subtrade", trade_line_id: "L1", amount: 400 },
      { kind: "material", trade_line_id: "L1", amount: 999 }, // ignored
      { kind: "subtrade", trade_line_id: null, amount: 50 },
    ];
    const by = subtradeActualsByLine(rows);
    expect(by.L1).toBe(1000);
    expect(by[UNASSIGNED_LINE]).toBe(50);
  });

  it("rowsToSubtradeLines builds one line per trade + resolves names + variance", () => {
    const lines = rowsToSubtradeLines(tradeRows, { L1: 1000 }, tradeName, subName);
    const l1 = lines.find((l) => l.lineId === "L1")!;
    expect(l1.tradeName).toBe("Countertop");
    expect(l1.subtradeName).toBe("Stoneworks");
    expect(l1.subtradeId).toBe("s-stone");
    expect(l1.budget).toBe(800);
    expect(l1.actual).toBe(1000);
    expect(l1.variance).toBe(200);
    const l2 = lines.find((l) => l.lineId === "L2")!;
    expect(l2.subtradeName).toBeNull();
  });

  it("rowsToSubtradeLines appends an Unassigned line when that bucket is non-zero", () => {
    const lines = rowsToSubtradeLines(tradeRows, { [UNASSIGNED_LINE]: 75 }, tradeName, subName);
    const u = lines.find((l) => l.lineId === UNASSIGNED_LINE)!;
    expect(u.tradeName).toBe("Unassigned");
    expect(u.actual).toBe(75);
    expect(u.budget).toBe(0);
  });

  it("subtradeLineProjected: done → actual; open → max(actual,budget)", () => {
    const done: SubtradeLine = { lineId: "L1", tradeName: "C", subtradeName: null, subtradeId: null, status: "done", budget: 800, actual: 1000, variance: 200, variancePct: 25 };
    expect(subtradeLineProjected(done, false)).toBe(1000);
    const openUnder: SubtradeLine = { ...done, status: "booked", actual: 500 };
    expect(subtradeLineProjected(openUnder, false)).toBe(800); // under-budget open → budget (0 drift)
    const openOver: SubtradeLine = { ...done, status: "booked", actual: 900 };
    expect(subtradeLineProjected(openOver, false)).toBe(900);
  });

  it("computeBudgetVsActual folds subtrade drift into projectedMargin + clawback", () => {
    const line: SubtradeLine = { lineId: "L1", tradeName: "C", subtradeName: null, subtradeId: null, status: "booked", budget: 800, actual: 1000, variance: 200, variancePct: 25 };
    const result: BvaResult = computeBudgetVsActual({
      labourBudget: [], labourActuals: [],
      materialsBudget: 0, materialsActual: 0,
      subtradeLines: [line],
      overhead: 0, quotedMargin: 10000,
      currentMilestone: "cnc", pipelineComplete: false,
    });
    expect(result.subtradeDrift).toBe(200); // projected 1000 − budget 800
    expect(result.projectedMargin).toBe(9800); // 10000 − 0 − 0 − 200
    expect(result.clawback).toBe(200);
    expect(result.other.subtrades.budget).toBe(800);
    expect(result.other.subtrades.actual).toBe(1000);
    expect(result.other.subtrades.lines).toHaveLength(1);
  });

  it("under-budget open subtrade contributes zero drift", () => {
    const line: SubtradeLine = { lineId: "L1", tradeName: "C", subtradeName: null, subtradeId: null, status: "booked", budget: 800, actual: 200, variance: -600, variancePct: -75 };
    const result = computeBudgetVsActual({
      labourBudget: [], labourActuals: [], materialsBudget: 0, materialsActual: 0,
      subtradeLines: [line], overhead: 0, quotedMargin: 10000,
      currentMilestone: "cnc", pipelineComplete: false,
    });
    expect(result.subtradeDrift).toBe(0);
    expect(result.projectedMargin).toBe(10000);
  });
});
```

Note: the existing ported tests will also need their `subtradeBudget: N` inputs changed to `subtradeLines: []` (or a line list) as part of Step 5/8 below — update them when `BvaInput` changes so the whole suite compiles.

- [ ] **Step 0b: Run tests to confirm they fail.**

Run: `npm test`
Expected: FAIL — `subtradeActualsByLine`/`rowsToSubtradeLines`/`subtradeLineProjected`/`UNASSIGNED_LINE` not exported; `subtradeLines` not on `BvaInput`.

- [ ] **Step 1: Add the `SubtradeLine` type and the `UNASSIGNED_LINE` constant.**

After the `OtherCosts` type (or near the other exported types) add:

```ts
export const UNASSIGNED_LINE = "__unassigned__";

export type SubtradeLine = {
  lineId: string;
  tradeName: string;
  subtradeName: string | null; // null = TBD (no subtrade assigned)
  subtradeId: string | null; // job_trades.subtrade_id; used as partner_id when logging
  status: "needed" | "booked" | "done";
  budget: number; // job_trades.cost (0 if null)
  actual: number; // Σ kind='subtrade' actuals for this trade_line_id
  variance: number; // actual − budget
  variancePct: number | null;
};
```

- [ ] **Step 2: Add the `subtradeActualsByLine` mapper.**

Add near `materialActualTotal`:

```ts
// Sums `amount` of kind='subtrade' actuals, grouped by trade_line_id.
// Rows with a null trade_line_id accumulate under UNASSIGNED_LINE so money is
// never silently dropped.
export function subtradeActualsByLine(rows: Record<string, unknown>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.kind !== "subtrade") continue;
    const key = r.trade_line_id != null ? String(r.trade_line_id) : UNASSIGNED_LINE;
    out[key] = (out[key] ?? 0) + Number(r.amount ?? 0);
  }
  return out;
}
```

- [ ] **Step 3: Add the `rowsToSubtradeLines` mapper.**

```ts
// Builds one SubtradeLine per job_trades row, plus an Unassigned line if any
// subtrade actual has a null trade_line_id. tradeName/subtradeName resolve from
// the registries (the store passes embedded names).
export function rowsToSubtradeLines(
  jobTrades: Record<string, unknown>[],
  actualsByLine: Record<string, number>,
  tradeName: (id: string) => string | undefined,
  subtradeName: (id: string) => string | undefined
): SubtradeLine[] {
  const lines: SubtradeLine[] = jobTrades.map((r) => {
    const lineId = String(r.id);
    const budget = Number(r.cost ?? 0);
    const actual = actualsByLine[lineId] ?? 0;
    const variance = actual - budget;
    const tradeId = r.trade_id != null ? String(r.trade_id) : "";
    const subId = r.subtrade_id != null ? String(r.subtrade_id) : null;
    const rawStatus = String(r.status ?? "needed");
    const status: SubtradeLine["status"] =
      rawStatus === "booked" || rawStatus === "done" ? rawStatus : "needed";
    return {
      lineId,
      tradeName: tradeName(tradeId) ?? "Trade",
      subtradeName: subId != null ? (subtradeName(subId) ?? null) : null,
      subtradeId: subId,
      status,
      budget,
      actual,
      variance,
      variancePct: variancePct(variance, budget),
    };
  });

  const unassigned = actualsByLine[UNASSIGNED_LINE] ?? 0;
  if (unassigned !== 0) {
    lines.push({
      lineId: UNASSIGNED_LINE,
      tradeName: "Unassigned",
      subtradeName: null,
      subtradeId: null,
      status: "needed",
      budget: 0,
      actual: unassigned,
      variance: unassigned,
      variancePct: variancePct(unassigned, 0),
    });
  }
  return lines;
}
```

- [ ] **Step 4: Add the per-line projection helper.**

Add near `projectedPhaseCost`:

```ts
// A trade-line projects like a phase: a 'done' line is locked to its actual;
// an open line projects to max(actual, budget) so an under-budget open line
// contributes zero drift (mirrors materials' open-job rule).
export function subtradeLineProjected(line: SubtradeLine, pipelineComplete: boolean): number {
  if (pipelineComplete || line.status === "done") return line.actual;
  return Math.max(line.actual, line.budget);
}
```

- [ ] **Step 5: Update `BvaInput` — replace `subtradeBudget` with `subtradeLines`.**

In the `BvaInput` type, change:

```ts
// remove:  subtradeBudget: number;
// add:
subtradeLines: SubtradeLine[];
```

- [ ] **Step 6: Update `OtherCosts.subtrades` shape.**

```ts
// before: subtrades: { budget: number };
subtrades: {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
  lines: SubtradeLine[];
};
```

- [ ] **Step 7: Update `BvaResult` — add `subtradeDrift`.**

Add `subtradeDrift: number;` next to `materialDrift: number;`.

- [ ] **Step 8: Wire subtrade drift + the new `other.subtrades` into `computeBudgetVsActual`.**

In `computeBudgetVsActual`: destructure `subtradeLines` instead of `subtradeBudget`. After the `materialDrift` block, add:

```ts
const subtradeBudget = subtradeLines.reduce((s, l) => s + l.budget, 0);
const subtradeActual = subtradeLines.reduce((s, l) => s + l.actual, 0);
const subtradeProjected = subtradeLines.reduce(
  (s, l) => s + subtradeLineProjected(l, pipelineComplete),
  0
);
const subtradeDrift = subtradeProjected - subtradeBudget;
const subtradeVariance = subtradeActual - subtradeBudget;
```

Change the margin lines to include subtrade drift:

```ts
const projectedMargin = budgetedMargin - labourDrift - materialDrift - subtradeDrift;
const clawback = Math.max(0, labourDrift + materialDrift + subtradeDrift);
```

Change `other.subtrades` from `{ budget: subtradeBudget }` to:

```ts
subtrades: {
  budget: subtradeBudget,
  actual: subtradeActual,
  variance: subtradeVariance,
  variancePct: variancePct(subtradeVariance, subtradeBudget),
  lines: subtradeLines,
},
```

Add `subtradeDrift,` to the returned object.

- [ ] **Step 9: Update the ported tests for the new `BvaInput` shape, then run green.**

In `budgetVsActual.test.ts`, change every ported case that passes `subtradeBudget: N` to `subtradeLines: []` (the old cases asserted `other.subtrades.budget`; with no lines that is now `0`, so update those few expected values to `0`, or supply a one-line `subtradeLines` list matching the old budget — prefer the latter to preserve intent). Then:

Run: `npm test`
Expected: PASS — all ported cases + the new subtrade cases from Step 0 are green.

- [ ] **Step 10: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS for `budgetVsActual.ts` + the test file. Callers in store/tab still reference the old shape — those are Tasks 2/3; if tsc flags ONLY those two files, that is expected.

- [ ] **Step 11: Commit.**

```bash
git add features/job-costing/lib/budgetVsActual.ts features/job-costing/lib/budgetVsActual.test.ts
git commit -m "feat(job-costing): subtrade per-line types, mappers, and drift in BVA data layer + tests (Slice C)"
```

---

### Task 2: Store — load subtrade actuals, resolve names, `logActual` union

**Files:**
- Modify: `features/job-costing/lib/budgetVsActualStore.tsx`

**Interfaces:**
- Consumes (from Task 1): `subtradeActualsByLine`, `rowsToSubtradeLines`, `SubtradeLine`.
- Produces: `BvaData.subtradeLines: SubtradeLine[]`; `LogActualInput` discriminated union (below). The tab (Task 3) consumes `data.subtradeLines` via the computed `BvaResult.other.subtrades.lines` and calls `logActual({kind:'subtrade', ...})`.

- [ ] **Step 1: Import the new symbols.**

In the import from `@features/job-costing/lib/budgetVsActual`, add `subtradeActualsByLine`, `rowsToSubtradeLines`, and `type SubtradeLine`. Remove `subtradeBudgetTotal` if no longer used.

- [ ] **Step 2: Update `BvaData`.**

```ts
type BvaData = {
  labourBudget: BudgetLine[];
  labourActuals: LabourActual[];
  materialsActual: number;
  subtradeLines: SubtradeLine[]; // was: subtradeBudget: number
};
```

Update `EMPTY_DATA` to `subtradeLines: []`.

- [ ] **Step 3: Load both actual kinds + embed names in the fetch.**

In the `Promise.all`, change the actuals and trades queries:

```ts
// was: .from("job_cost_actuals").select("*").eq("job_id", jobId).eq("kind", "material"),
sb.from("job_cost_actuals").select("*").eq("job_id", jobId),
// was: .from("job_trades").select("*").eq("job_id", jobId),
sb.from("job_trades").select("*, trades(label), subtrades(name)").eq("job_id", jobId),
```

`materialActualTotal` already filters `kind==='material'` internally, so the material path is unchanged by loading all kinds.

- [ ] **Step 4: Build `subtradeLines` in `setData`.**

Replace the `subtradeBudget` line. The embedded relations arrive as nested objects (`row.trades?.label`, `row.subtrades?.name`); build resolver closures from the rows themselves:

```ts
const tradeRows = (trades.data ?? []) as Record<string, unknown>[];
const actualRows = (actuals.data ?? []) as Record<string, unknown>[];
const tradeNameById = new Map<string, string>();
const subNameById = new Map<string, string>();
for (const r of tradeRows) {
  const t = r.trades as { label?: string } | null;
  const s = r.subtrades as { name?: string } | null;
  if (r.trade_id != null && t?.label) tradeNameById.set(String(r.trade_id), t.label);
  if (r.subtrade_id != null && s?.name) subNameById.set(String(r.subtrade_id), s.name);
}
const subtradeLines = rowsToSubtradeLines(
  tradeRows,
  subtradeActualsByLine(actualRows),
  (id) => tradeNameById.get(id),
  (id) => subNameById.get(id)
);
```

Set `subtradeLines` in the `setData` object (drop `subtradeBudget`). Keep `materialsActual: materialActualTotal(actualRows)`.

- [ ] **Step 5: Make `logActual` a discriminated union.**

Replace `LogActualInput` and the insert. The existing material insert uses `phase_id: a.phaseId`:

```ts
export type LogActualInput =
  | { kind: "material"; phaseId: MilestoneStage | null; amount: number; date?: string; note?: string }
  | { kind: "subtrade"; tradeLineId: string; partnerId: string | null; amount: number; date?: string; note?: string };
```

In `logActual`, branch the insert body:

```ts
const base = { job_id: jobId, amount: a.amount, note: a.note, actual_date: a.date ?? null };
const row =
  a.kind === "material"
    ? { ...base, kind: "material" as const, phase_id: a.phaseId }
    : { ...base, kind: "subtrade" as const, trade_line_id: a.tradeLineId, partner_id: a.partnerId };
const { error: insertErr } = await getSupabase().from("job_cost_actuals").insert(row);
```

(Keep the existing `if (!hasSupabase()) return;`, try/catch, and `await refresh()`.)

- [ ] **Step 6: Pass `subtradeLines` into `computeBudgetVsActual`.**

Wherever the hook calls `computeBudgetVsActual({...})`, change `subtradeBudget: data.subtradeBudget` to `subtradeLines: data.subtradeLines`.

- [ ] **Step 7: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS for the store. The tab (Task 3) may still reference old shapes — expected; fixed next.

- [ ] **Step 8: Commit.**

```bash
git add features/job-costing/lib/budgetVsActualStore.tsx
git commit -m "feat(job-costing): load subtrade actuals + embed names; logActual union (Slice C)"
```

---

### Task 3: UI — Subtrades table, log-modal toggle, drop the caveat

**Files:**
- Modify: `features/job-costing/components/BudgetVsActualTab.tsx`
- Modify: files under `features/job-costing/components/bva/` (the view/section components — locate the subtrades stub and the log-actual modal here)

**Interfaces:**
- Consumes (from Tasks 1–2): `result.other.subtrades.{budget,actual,variance,variancePct,lines}`, each `SubtradeLine`, `result.subtradeDrift`, `logActual({kind:'subtrade',...})`, and the job's trade-lines for the modal dropdown (from `result.other.subtrades.lines` — each has `lineId`, `tradeName`, `subtradeName`, `subtradeId`; the modal passes `partnerId: line.subtradeId`).

- [ ] **Step 1: Locate the subtrades stub and the log-actual modal.**

Run: `grep -rn "actuals tracked later\|excl. subtrade actuals\|Log actual cost\|other.subtrades" features/job-costing/components/`
Note the exact files/lines (the stub is at `BudgetVsActualTab.tsx:443` and the caveat at `:138` per the spec; the modal may live in `bva/`).

- [ ] **Step 2: Replace the subtrades stub with a per-line table.**

Render a table matching the Materials/Labour table styling (same wrapper, header row, tokens). One row per `result.other.subtrades.lines`: columns `Trade · Subtrade (or "TBD") · status chip · Budget · Actual · Variance · Var%`, then a total row using `result.other.subtrades.{budget,actual,variance,variancePct}`. Money via `formatCAD`. Reuse the existing variance color logic used by the labour table (negative/positive tone). Reuse the existing status-chip component if one exists (check `bva/` and the Overview Trades card); otherwise a simple token-styled pill.

- [ ] **Step 3: Drop the caveat label.**

At the header label (spec `:138`), change `projected margin (excl. subtrade actuals)` to `projected margin`. Remove any now-unused conditional/string.

- [ ] **Step 4: Add the Material | Subtrade toggle to the log-actual modal.**

Add a segmented control (Material default). When Subtrade is selected, show a required dropdown of this job's trade-lines (`result.other.subtrades.lines` where `lineId !== UNASSIGNED_LINE`), labelled `${tradeName} — ${subtradeName ?? "TBD"}`. On submit, call `logActual({ kind:'subtrade', tradeLineId, partnerId, amount, date, note })`. Keep the material branch calling `logActual({ kind:'material', phaseId, amount, ... })` exactly as before. Reuse existing form inputs/validation; amount required and > 0.

- [ ] **Step 5: Type-check + lint + build.**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add features/job-costing/components
git commit -m "feat(job-costing): subtrades budget-vs-actual table + log toggle; drop caveat (Slice C)"
```

---

### Task 4: Docs — ADR, glossary, roadmap, feature CLAUDE.md

**Files:**
- Create: `docs/decisions/0015-subtrade-actuals-per-line.md`
- Modify: `docs/domain.md`, `docs/roadmap.md`, `features/job-costing/CLAUDE.md`

- [ ] **Step 1: Write ADR 0015.**

Record: subtrade actuals shipped at **per-trade-line** grain; **no migration** (`job_cost_actuals` already supported `kind='subtrade'`); the "(excl. subtrade actuals)" caveat is dropped — projected margin is now all-in; per-line projection locks on `status='done'`; null-`trade_line_id` actuals surface as an "Unassigned" line. Note this supersedes ADR 0014's "subtrades — job-level budget only / actuals deferred to C" and that **ADR 0007 needs no amendment** (no `job_trades.phase_id`, no schedule dates). Status: Accepted.

- [ ] **Step 2: Update `docs/domain.md`.**

Add/confirm glossary entries for "trade-line variance" and "subtrade actual" consistent with existing phrasing.

- [ ] **Step 3: Update `docs/roadmap.md`.**

Mark the cost-codes stack A–D complete and Slice C (subtrade actuals) shipped; remove any "deferred" note for subtrade actuals.

- [ ] **Step 4: Update `features/job-costing/CLAUDE.md`.**

Note that subtrade actuals are logged via the BVA "Log actual cost" toggle and tracked per trade-line; `scripts/seed-bva-smoke.ts` already seeds a Countertop trade-line + an $800 subtrade budget for smoking.

- [ ] **Step 5: Commit.**

```bash
git add docs/decisions/0015-subtrade-actuals-per-line.md docs/domain.md docs/roadmap.md features/job-costing/CLAUDE.md
git commit -m "docs(job-costing): ADR 0015 subtrade actuals per-line; glossary + roadmap (Slice C)"
```

---

## Verification (workflow step 7)

**Math gate (Vitest):** `npm test` — must be green (ported labour/material cases + new subtrade cases). This is the fast, exhaustive check on the numbers.

**Feature gate (authed Playwright browser smoke against the DoD):** run after Task 3 (Task 4 can follow). Restart `npm run dev` first if a `build` ran (it clobbers `.next` — see [[claude-smoke-test-user]]). Log in by clicking the **Sign in button**, not Enter. Seed + log in:

```bash
npx tsx scripts/seed-bva-smoke.ts 2        # seeds the $800 Countertop trade-line
npx tsx scripts/reset-smoke-user.ts <pw>   # then log in via the Sign in BUTTON (not Enter)
```

Walk the 6 DoD checks from the spec on `/jobs/2 → Budget vs Actual`:
1. Caveat gone; Countertop Budget $800 / Actual $0.
2. Log $1,000 subtrade actual vs Countertop → Actual $1,000, Variance +$200, Clawback +$200.
3. `status='done'` line locks projection to actual.
4. Open under-budget line → $0 drift.
5. Two lines → totals sum; `subtradeDrift` = Σ projected − Σ budget.
6. Null-`trade_line_id` subtrade actual → "Unassigned" line, included in total.

Clean up: `npx tsx scripts/seed-bva-smoke.ts 2 --clean`.

## Retro (workflow step 8)

2-minute close-out: capture any new catch as an eslint rule / CLAUDE.md gotcha / smoke-fixture extension so the next slice is cheaper. Candidate: if the embed (`trades(label)`/`subtrades(name)`) needed RLS or FK-naming fixes, note the working select string in `features/job-costing/CLAUDE.md`.

---

## Self-review

**Spec coverage:**
- Per-trade-line grain → Task 1 (`SubtradeLine`, `rowsToSubtradeLines`) + Task 3 table. ✓
- No migration → Global Constraints + Task 4 ADR. ✓
- Read subtrade actuals → Task 2 Step 3 (drop kind filter). ✓
- Name resolution via embed → Task 2 Steps 3–4. ✓
- Margin mirrors materials, per-line projection, done-lock → Task 1 Steps 4, 8. ✓
- `logActual` union (material keeps phaseId) → Task 2 Step 5. ✓
- Subtrades table + total → Task 3 Step 2. ✓
- Log modal toggle + trade-line picker → Task 3 Step 4. ✓
- Drop caveat label → Task 3 Step 3. ✓
- Unassigned bucket (DoD #6) → Task 1 Steps 1–3 (`UNASSIGNED_LINE`) + Task 3 dropdown filter. ✓
- All 6 DoD checks → Verification section. ✓
- ADR/domain/roadmap follow-up → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows code. `SubtradeLine.subtradeId` is defined in Task 1 (Steps 1, 3) and consumed by Task 3 (`partnerId: line.subtradeId`) — no deferred details remain.

**Type consistency:** `SubtradeLine`, `subtradeActualsByLine`, `rowsToSubtradeLines`, `subtradeLineProjected`, `UNASSIGNED_LINE`, `subtradeDrift`, `LogActualInput` used identically across tasks. `subtradeLines` replaces `subtradeBudget` consistently in `BvaInput`/`BvaData`/the `computeBudgetVsActual` call.
