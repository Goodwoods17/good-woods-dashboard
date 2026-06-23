# Subtrade Actuals (P4 / Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track subtrade actual cost vs quoted cost per trade-line in the Budget-vs-Actual tab, fold subtrade drift into projected margin, and drop the "(excl. subtrade actuals)" caveat.

**Architecture:** Pure data layer (`budgetVsActual.ts`) gains subtrade types, mappers, and per-line drift in `computeBudgetVsActual`. The store (`budgetVsActualStore.tsx`) loads subtrade actuals (drop the `kind='material'` filter) and resolves trade/subtrade names via a PostgREST embed. The tab renders a per-line Subtrades table and a Material|Subtrade toggle in the log-actual modal. **No migration** — `job_cost_actuals` already supports `kind='subtrade'` with `trade_line_id`.

**Tech Stack:** Next.js 14 / React 18 / TypeScript (strict), Supabase (`@supabase/ssr`), Tailwind design tokens, lucide-react.

## Global Constraints

- **No new dependencies.** No test runner exists; verification is `npx tsc --noEmit` + `npm run lint` + `npm run build` + an authed browser smoke against the DoD (see spec). Copy the Slice D pattern.
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

- [ ] **Step 9: Type-check.**

Run: `npx tsc --noEmit`
Expected: PASS (callers in store/tab will still reference the old shape — those are Tasks 2/3; if tsc flags ONLY those two files, that is expected and they are fixed next. If it flags `budgetVsActual.ts` itself, fix before moving on.)

- [ ] **Step 10: Commit.**

```bash
git add features/job-costing/lib/budgetVsActual.ts
git commit -m "feat(job-costing): subtrade per-line types, mappers, and drift in BVA data layer (Slice C)"
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

## Verification (workflow step 7 — authed browser smoke against DoD)

Not a code task; run after Task 3 (Task 4 can follow). Restart `npm run dev` first if a `build` ran (it clobbers `.next` — see [[claude-smoke-test-user]]). Seed + log in:

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
