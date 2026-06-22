# Slice B Part 2 — Daily Time Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Time cards" view that rolls up the captured `labour_sessions` into daily hours — per employee (payroll) and per project (job-costing) — with a simple correction path (edit/delete a session) and a CSV export. Hours only (no $ — pay rates are a later slice).

**Architecture:** Pure aggregation (`buildTimeCards`) over the existing `labour_sessions` (active time via `durationMs`), surfaced as a new **"Time cards"** tab in `/labour` (next to Timers / Bottlenecks / Setup). Corrections add a single `updateSession` to the labour store (`deleteSession` already exists). No new table, no new provider — it reads the data the capture board (Part 1) produces.

**Tech Stack:** Next.js 14 / React 18 / TS strict, Supabase (existing `labour_sessions`), `tsx` tests, Tailwind tokens.

## Global Constraints
- Path aliases (`@features/*`, `@shared/*`); TS strict; no `Set`/`Map` spread or `for…of` over a `Set`.
- No jest — `tsx` `node:assert/strict` scripts under `scripts/`, run `npx tsx scripts/<name>.ts`.
- Tailwind tokens only (`bg-surface`, `border-border`, `text-text-{primary,secondary,tertiary}`, `bg-surface-muted`, `bg-ink-pill`, `text-accent`, `shadow-resting`). Hours formatting via `formatDuration` from `@features/labour/lib/labourStore`.
- Reuse, don't reinvent: active-time hours come from `durationMs(session)` (exported, `labourStore.tsx:93`); `formatDuration(ms)` (`:870`); `useNow` (`:856`).
- Time cards cover **completed** sessions (`endedAt != null`). Hours only; no pay $; no approval workflow; no logins.
- Per-task gate: `npx tsc --noEmit` clean + the task's tsx test green. Full gate (`lint`, `build`) at the final task.
- Commit after each task; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `updateSession` in the labour store (corrections)

**Files:** Modify `features/labour/lib/labourStore.tsx`.

**Interfaces:**
- Produces: `updateSession(sessionId: string, patch: { startedAt?: string; accumulatedMs?: number; quantity?: number | null }): void` on the context value. Writes the camel→snake columns (`started_at`, `accumulated_ms`, `quantity`) to `labour_sessions` and updates local state. (Corrections edit the session's **date** + **hours** + **quantity** — hours map to `accumulated_ms` since active-time is the basis, not raw wall-clock.)

- [ ] **Step 1: Add `updateSession` next to `deleteSession`**

In `features/labour/lib/labourStore.tsx`: add `updateSession` to the `LabourContextValue` type (near `deleteSession: (sessionId: string) => void;`):
```ts
  updateSession: (sessionId: string, patch: { startedAt?: string; accumulatedMs?: number; quantity?: number | null }) => void;
```
Implement it as a `useCallback` modeled on `deleteSession` (find `deleteSession`'s `useCallback` around `:539`): update local `sessions` state with the patch (camelCase fields), and when `isSb` write the snake_case columns:
```ts
const updateSession = useCallback(
  (sessionId: string, patch: { startedAt?: string; accumulatedMs?: number; quantity?: number | null }) => {
    setSessions((prev) => prev.map((s) => (s.id === sessionId
      ? { ...s,
          startedAt: patch.startedAt ?? s.startedAt,
          accumulatedMs: patch.accumulatedMs ?? s.accumulatedMs,
          quantity: patch.quantity !== undefined ? patch.quantity : s.quantity }
      : s)));
    if (isSb) {
      const row: Record<string, unknown> = {};
      if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
      if (patch.accumulatedMs !== undefined) row.accumulated_ms = patch.accumulatedMs;
      if (patch.quantity !== undefined) row.quantity = patch.quantity;
      if (Object.keys(row).length > 0) {
        void sb().from("labour_sessions").update(row).eq("id", sessionId).then(({ error }) => { if (error) setError(formatError(error)); });
      }
    }
  },
  [isSb]
);
```
Add `updateSession` to BOTH the `LabourContextValue` provider value object (there are two — find the `value={{ … }}` near `:796`/`:826`; add `updateSession,` in each). Confirm `sb`, `setError`, `formatError`, `setSessions` are the real names used by `deleteSession` and match them.

- [ ] **Step 2: Typecheck + commit**

`npx tsc --noEmit` clean.
```bash
git add features/labour/lib/labourStore.tsx
git commit -m "feat(labour): updateSession for time-card corrections (Slice B Part 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `buildTimeCards` aggregation (pure) + test

**Files:** Create `features/labour/lib/timeCards.ts`, `scripts/test-time-cards.ts`.

**Interfaces:**
- Consumes: `LabourSession`, `durationMs` from `@features/labour/lib/labourStore`.
- Produces:
  - `export type TimeCardEntry = { sessionId; date: string; workerId: string|null; jobId: string|null; operationId: string|null; ms: number }`
  - `export type DayCard = { workerId: string|null; date: string; entries: TimeCardEntry[]; totalMs: number }`
  - `export type ProjectDay = { jobId: string|null; date: string; entries: TimeCardEntry[]; totalMs: number }`
  - `export function buildTimeCards(sessions: LabourSession[]): { byWorkerDay: DayCard[]; byJobDay: ProjectDay[] }` — completed sessions only; `date` = `startedAt` sliced to `yyyy-mm-dd`; `ms` = `durationMs(s)`; grouped + summed; sorted by date desc.

- [ ] **Step 1: Write the failing test**

`scripts/test-time-cards.ts`:
```ts
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { buildTimeCards } from "../features/labour/lib/timeCards";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

// Two completed sessions same worker same day (3600000ms + 1800000ms) + one running (excluded).
const sessions: any[] = [
  { id: "s1", workerId: "w1", jobId: "j1", operationId: "o1", startedAt: "2026-06-20T09:00:00.000Z", endedAt: "2026-06-20T10:00:00.000Z", accumulatedMs: 3600000, resumedAt: null, targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
  { id: "s2", workerId: "w1", jobId: "j2", operationId: "o2", startedAt: "2026-06-20T11:00:00.000Z", endedAt: "2026-06-20T11:30:00.000Z", accumulatedMs: 1800000, resumedAt: null, targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
  { id: "s3", workerId: "w1", jobId: "j1", operationId: "o1", startedAt: "2026-06-21T09:00:00.000Z", endedAt: null, accumulatedMs: 0, resumedAt: "2026-06-21T09:00:00.000Z", targetQuantity: null, quantity: null, categoryId: null, cardId: null, note: null },
];

const { byWorkerDay, byJobDay } = buildTimeCards(sessions);

check("groups completed sessions by (worker, day); excludes running", () => {
  assert.equal(byWorkerDay.length, 1); // s3 running → excluded; s1+s2 same worker+day
  assert.equal(byWorkerDay[0].entries.length, 2);
  assert.equal(byWorkerDay[0].totalMs, 5400000); // 1h + 0.5h
  assert.equal(byWorkerDay[0].date, "2026-06-20");
});

check("per-project rollup splits the same day by job", () => {
  const j1 = byJobDay.find((p) => p.jobId === "j1" && p.date === "2026-06-20");
  const j2 = byJobDay.find((p) => p.jobId === "j2" && p.date === "2026-06-20");
  assert.equal(j1!.totalMs, 3600000);
  assert.equal(j2!.totalMs, 1800000);
});

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run → fails** (`npx tsx scripts/test-time-cards.ts` — `buildTimeCards` missing).

- [ ] **Step 3: Implement `timeCards.ts`**
```ts
// Daily time-card aggregation (Slice B Part 2). Pure: rolls completed labour
// sessions into per-(worker,day) and per-(job,day) hours. Hours = active time
// (durationMs), pauses excluded. No $; pay rates are a later slice.
import { durationMs, type LabourSession } from "./labourStore";

export type TimeCardEntry = {
  sessionId: string; date: string;
  workerId: string | null; jobId: string | null; operationId: string | null; ms: number;
};
export type DayCard = { workerId: string | null; date: string; entries: TimeCardEntry[]; totalMs: number };
export type ProjectDay = { jobId: string | null; date: string; entries: TimeCardEntry[]; totalMs: number };

function dayOf(iso: string): string { return iso.slice(0, 10); }

export function buildTimeCards(sessions: LabourSession[]): { byWorkerDay: DayCard[]; byJobDay: ProjectDay[] } {
  const completed = sessions.filter((s) => s.endedAt != null);
  const entries: TimeCardEntry[] = completed.map((s) => ({
    sessionId: s.id, date: dayOf(s.startedAt),
    workerId: s.workerId, jobId: s.jobId, operationId: s.operationId, ms: durationMs(s),
  }));

  const wMap = new Map<string, DayCard>();
  const jMap = new Map<string, ProjectDay>();
  for (const e of entries) {
    const wk = `${e.workerId ?? "—"}__${e.date}`;
    let w = wMap.get(wk);
    if (!w) { w = { workerId: e.workerId, date: e.date, entries: [], totalMs: 0 }; wMap.set(wk, w); }
    w.entries.push(e); w.totalMs += e.ms;

    const jk = `${e.jobId ?? "—"}__${e.date}`;
    let j = jMap.get(jk);
    if (!j) { j = { jobId: e.jobId, date: e.date, entries: [], totalMs: 0 }; jMap.set(jk, j); }
    j.entries.push(e); j.totalMs += e.ms;
  }
  const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  return {
    byWorkerDay: Array.from(wMap.values()).sort(byDateDesc),
    byJobDay: Array.from(jMap.values()).sort(byDateDesc),
  };
}
```

- [ ] **Step 4: Run → passes** (`2 checks passed.`). **Step 5: tsc clean + commit**
```bash
git add features/labour/lib/timeCards.ts scripts/test-time-cards.ts
git commit -m "feat(labour): buildTimeCards daily aggregation (Slice B Part 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `TimeCardsView` — per-employee + per-project lenses + CSV

**Files:** Create `features/labour/components/TimeCardsView.tsx`.

**Interfaces:**
- Consumes: `useLabour()` (`sessions`, `workers`, `jobs`? — jobs come from `useJobs`), `buildTimeCards`, `formatDuration`, `workerById`, `operationById`. Job names from `@features/jobs/lib/jobsStore` `useJobs().jobs`.
- Produces: `export function TimeCardsView()`.

- [ ] **Step 1: Implement** a two-lens view: a lens toggle ("By employee" | "By project"). 
  - **By employee:** group `byWorkerDay`; for each, a header (worker name · date · `formatDuration(totalMs)`), then rows (job name · op code · `formatDuration(ms)`) with an **Edit** + **Delete** affordance per row (wired in Task 4).
  - **By project:** group `byJobDay`; header (job name · date · total), rows (worker · op · hours).
  - A **"Export CSV"** button (Task 5).
  Use tokens; reuse `formatDuration`. Empty state: "No completed sessions yet." Mirror the layout idiom of `BottleneckAnalytics.tsx` (read it for the card/bar styling).

- [ ] **Step 2: tsc clean + commit**
```bash
git add features/labour/components/TimeCardsView.tsx
git commit -m "feat(labour): TimeCardsView — per-employee + per-project lenses (Slice B Part 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Session correction (edit hours/date/quantity + delete)

**Files:** Modify `features/labour/components/TimeCardsView.tsx` (an inline edit row or small modal).

**Interfaces:** Consumes `useLabour().updateSession` (Task 1) + `deleteSession`.

- [ ] **Step 1:** Add a per-row **Edit** that opens a small form: **date** (`<input type="date">` → `startedAt` = that date at the session's original time, or midnight), **hours** (`<input type="number" step="0.25">` → `accumulatedMs = hours * 3600000`), **quantity** (optional). Save → `updateSession(sessionId, { startedAt, accumulatedMs, quantity })`. A **Delete** button → `deleteSession(sessionId)` with a `window.confirm`. (Hours edit writes `accumulated_ms` because active-time is the hours basis.)

- [ ] **Step 2:** tsc clean + commit
```bash
git add features/labour/components/TimeCardsView.tsx
git commit -m "feat(labour): time-card corrections (edit hours/date/qty, delete) (Slice B Part 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CSV export (hours only)

**Files:** Create `features/labour/lib/timeCardsCsv.ts`, `scripts/test-time-cards-csv.ts`; wire the button in `TimeCardsView`.

**Interfaces:**
- Produces: `export function timeCardsToCsv(entries: TimeCardEntry[], names: { worker: (id: string|null)=>string; job: (id: string|null)=>string; code: (id: string|null)=>string }): string` — header `Date,Worker,Job,Code,Hours`, one row per entry, hours = `(ms/3600000).toFixed(2)`. Pure + tested.

- [ ] **Step 1: Test** — assert the CSV string has the header + a row with correct hours (e.g. 3600000ms → `1.00`), commas escaped if a name contains one (wrap fields in quotes).
- [ ] **Step 2: Implement** the pure builder (quote every field; `""`-escape internal quotes). Wire `TimeCardsView`'s Export button to build the CSV from the current lens's entries + trigger a client download (`Blob` + an `<a download>` — standard pattern; guard `typeof window`).
- [ ] **Step 3:** Run test (green) + tsc + commit.

---

### Task 6: Wire the "Time cards" tab + verify

**Files:** Modify `features/labour/components/LabourView.tsx`, `features/labour/CLAUDE.md`.

- [ ] **Step 1:** In `LabourView.tsx`: extend the `Tab` type with `"timecards"`, add `{ key: "timecards", label: "Time cards" }` to the `tabs` array, import + render `<TimeCardsView />` when `tab === "timecards"`.
- [ ] **Step 2:** Update `features/labour/CLAUDE.md` — note the new Time cards tab (derived from `labour_sessions`; per-employee + per-project hours; corrections via `updateSession`; CSV; hours-only, no $).
- [ ] **Step 3: Full gate** — `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build` OK (`/labour` listed); `npx tsx scripts/test-time-cards.ts && npx tsx scripts/test-time-cards-csv.ts` green (plus the existing suites).
- [ ] **Step 4 (optional, defer if context-limited):** authenticated browser smoke — `/labour → Time cards`, confirm a completed session shows under its worker + day; edit its hours → total updates; export CSV. (Can be deferred to the impeccable pass.)
- [ ] **Step 5:** Commit.
```bash
git add features/labour/components/LabourView.tsx features/labour/CLAUDE.md
git commit -m "feat(labour): Time cards tab wired in /labour — Slice B Part 2 complete

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review
**Spec coverage** (Slice B spec "Daily time cards" §): per-employee lens (Task 3) ✓; per-project lens (Task 3) ✓; corrections edit/delete (Tasks 1, 4) ✓; CSV hours-only (Task 5) ✓; lives as a /labour tab (Task 6) ✓; hours from active time, completed sessions only (Task 2) ✓. **Deferred (correct):** pay $/payroll, approval workflow, logins.

**Placeholder scan:** Tasks 3 + 4 give structure + exact APIs rather than full JSX (they're conventional list/form UI built from the named existing example `BottleneckAnalytics.tsx` + the exact store calls). Pure logic (Tasks 2, 5) + the store change (Task 1) are fully coded.

**Type consistency:** `buildTimeCards` shapes (`DayCard`/`ProjectDay`/`TimeCardEntry`) consistent across Tasks 2/3/5; `updateSession(id, {startedAt, accumulatedMs, quantity})` (Task 1) consumed in Task 4; `durationMs`/`formatDuration` reused (not redefined).

**Verify-against-code items (don't guess):** the exact names `setSessions`/`sb`/`setError`/`formatError` in `deleteSession`'s closure (Task 1); the `value={{…}}` provider object location(s); whether `useLabour` exposes `jobs` or the view must use `useJobs` (it must — labour store doesn't own jobs).
