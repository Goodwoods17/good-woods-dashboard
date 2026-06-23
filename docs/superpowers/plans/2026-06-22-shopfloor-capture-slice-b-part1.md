# Slice B Part 1 — Shop-floor capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 6-phase shop-floor board where each card is a task linked to a cost code; tapping Start/Stop on a card (per worker) writes a `labour_session` tagged `(worker, job, code, card, quantity)` — the reliable per-code, per-worker actuals P4 reads. Cards seed from the frozen budget + manual add; `stuck` flagging + a "Needs a code" triage.

**Architecture:** A new `work_cards` table + a `useWorkCards` store (dual-mode supabase/localStorage, mirroring the existing labour/shop stores). The reworked `/shop` route renders a shop-wide summary + a per-job board; each card mounts the existing presentational `TaskTimer` (PR #10) and drives `useLabour().startTimer/stopTimer`, extended to carry `card_id`. Cards seed from `job_cost_budgets` at Save-as-Job. The old `shop_units` station board (localStorage, 4 stations) is retired.

**Tech Stack:** Next.js 14 / React 18 / TypeScript (strict), Supabase (Postgres + RLS via `@supabase/ssr`, migrations via the Supabase MCP), `@dnd-kit` (already used; NOT needed here — no cross-column drag), `tsx` for tests, Tailwind design tokens, Playwright MCP for the smoke.

## Global Constraints

- Path aliases only: `@/*`→`src/*`, `@features/*`→`features/*`, `@shared/*`→`shared/*`.
- TS strict. The project target rejects `Set`/`Map` spread + `for…of` over a `Set` — use `.forEach`/`Array.from`.
- No jest/vitest — tests are `node:assert/strict` scripts under `scripts/`, run with `npx tsx scripts/<name>.ts`. `tsx` resolves tsconfig `paths`.
- Tailwind tokens only (no hex): `bg-surface`, `border-border`, `text-text-{primary,secondary,tertiary,disabled}`, `bg-status-{on-track,at-risk,blocked,paused}{,-soft}`, `bg-ink-pill`, `shadow-resting/floating`, `duration-fast`. Money via `formatCAD` from `@shared/lib/format` (not used here — no $ in Part 1).
- Migrations: timestamp-prefixed SQL in `supabase/migrations/`, applied via the Supabase MCP `apply_migration` (project `zycdmlkffbaqofaygddx`); **rename the repo file to the recorded version** afterward (apply_migration stamps its own timestamp — the migration-drift lesson). RLS authenticated-all + anon-none on every new table; end with `notify pgrst, 'reload schema';`. Additive + idempotent (`create table if not exists`, `add column if not exists`).
- Stores are dual-mode: `const backend = hasSupabase() ? "supabase" : "localStorage"` (from `@shared/lib/supabase`); a localStorage cache key `gw_<name>_v1`.
- Domain terms (use precisely): **Work card** (task linked to a cost code), **Session** (a timer run against a card), **Stuck** (internal can't-proceed — NOT the pace "blocked" band), **Uncoded card / Needs-a-code triage**. See `docs/domain.md`.
- Verification gate per task: `npx tsc --noEmit` clean + the task's tsx test green. Full gate (`npm run lint`, `npm run build`) at the final task.
- Commit after each task. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Migration — `work_cards` + `labour_sessions.card_id` + `job_id`→text

The schema foundation. **De-risked:** `labour_sessions` currently has **0 rows**, so the `job_id` uuid→text conversion is a no-data type change (no orphan handling needed).

**Files:**
- Create: `supabase/migrations/<recorded-version>_work_cards.sql`

**Interfaces:**
- Produces: tables/columns `work_cards`, `labour_sessions.card_id`, `labour_sessions.job_id text`.

- [ ] **Step 1: Apply the migration via Supabase MCP**

Call `apply_migration` (project `zycdmlkffbaqofaygddx`, name `work_cards`) with:

```sql
-- Slice B Part 1 — shop-floor capture. Additive + idempotent.
-- work_cards: a task on the 6-phase board, linked to a cost code (operation).
create table if not exists public.work_cards (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  phase_id text not null references public.labour_categories(id) on delete restrict,
  operation_id uuid references public.labour_operations(id) on delete set null,  -- null = uncoded
  description text not null default '',
  target_quantity numeric,
  assignee_id uuid references public.labour_workers(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','doing','stuck','done')),
  stuck_reason text,
  source text not null default 'manual' check (source in ('budget','template','manual')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.work_cards is
  'A task on the shop-floor board (Slice B): linked to a cost code (operation_id) on a job. Sessions log time against it.';
create index if not exists work_cards_job_idx on public.work_cards (job_id);
create index if not exists work_cards_phase_idx on public.work_cards (phase_id);

drop trigger if exists work_cards_set_updated_at on public.work_cards;
create trigger work_cards_set_updated_at
  before update on public.work_cards
  for each row execute function public.set_updated_at();

-- labour_sessions: link a session to its card; fix job_id uuid -> text (0 rows, trivial).
alter table public.labour_sessions
  add column if not exists card_id uuid references public.work_cards(id) on delete set null;
alter table public.labour_sessions
  alter column job_id type text using job_id::text;

-- RLS
alter table public.work_cards enable row level security;
drop policy if exists "work_cards_authenticated_all" on public.work_cards;
create policy "work_cards_authenticated_all"
  on public.work_cards for all to authenticated using (true) with check (true);
drop policy if exists "work_cards_anon_none" on public.work_cards;
create policy "work_cards_anon_none"
  on public.work_cards for all to anon using (false) with check (false);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Verify the schema landed**

Call `execute_sql`:
```sql
select column_name, data_type from information_schema.columns where table_name='work_cards' order by ordinal_position;
select data_type from information_schema.columns where table_name='labour_sessions' and column_name in ('job_id','card_id') order by column_name;
```
Expected: `work_cards` has the 13 columns above; `labour_sessions.job_id` = `text`, `card_id` = `uuid`.

- [ ] **Step 3: Write the repo migration file aligned to the recorded version**

`execute_sql`: `select version, name from supabase_migrations.schema_migrations where name='work_cards';` → create `supabase/migrations/<version>_work_cards.sql` with the exact SQL from Step 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_work_cards.sql
git commit -m "feat(shop): work_cards table + labour_sessions.card_id + job_id->text (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `LabourSession.cardId` + `startTimer` carries `card_id`

The capture path must tag the session with its card. Small, additive change to the labour store.

**Files:**
- Modify: `features/labour/lib/labourStore.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LabourSession.cardId: string | null`; `startTimer` input gains `cardId?: string | null`; the insert writes `card_id`; `SessionRow` gains `card_id`.

- [ ] **Step 1: Add `cardId` to the `LabourSession` type**

In `features/labour/lib/labourStore.tsx`, in the `LabourSession` type (after `jobId`), add:
```ts
  cardId: string | null;     // the work_card this session is clocked against (Slice B)
```

- [ ] **Step 2: Add `card_id` to `SessionRow`**

In the `SessionRow` type, add:
```ts
  card_id: string | null;
```
And in the row→session mapper (where `SessionRow` is converted to `LabourSession` — find the `rowToSession`/`map` that reads `r.job_id`), add `cardId: r.card_id ?? null,`.

- [ ] **Step 3: Extend `startTimer` input + the in-memory session + the insert**

In `startTimer`'s input type, add `cardId?: string | null;`. Where the in-memory `session` object is built (it sets `jobId: input.jobId ?? null`), add `cardId: input.cardId ?? null,`. In the `.from("labour_sessions").insert({...})` object, add `card_id: session.cardId,`.

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit`
Expected: clean. (No test — the wiring is exercised by the browser smoke in Task 9. The existing `TimersBoard` start call omits `cardId`, which is fine — it's optional.)

- [ ] **Step 5: Commit**

```bash
git add features/labour/lib/labourStore.tsx
git commit -m "feat(labour): sessions carry card_id; startTimer accepts cardId (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `useWorkCards` store (types + CRUD + dual-mode load)

**Files:**
- Create: `features/shop/lib/workCardsStore.tsx`
- Test: `scripts/test-work-cards.ts`

**Interfaces:**
- Consumes: `hasSupabase`, `getSupabase` from `@shared/lib/supabase`.
- Produces:
  - `export type WorkCard = { id; jobId; phaseId; operationId: string|null; description; targetQuantity: number|null; assigneeId: string|null; status: "todo"|"doing"|"stuck"|"done"; stuckReason: string|null; source: "budget"|"template"|"manual"; sort: number }`
  - `export type NewWorkCard = Omit<WorkCard, "id">`
  - `export function WorkCardsProvider({ children })`, `export function useWorkCards(): WorkCardsContextValue`
  - `WorkCardsContextValue = { cards: WorkCard[]; loading; error; addCard(c: NewWorkCard): Promise<string>; updateCard(id, patch: Partial<WorkCard>): void; removeCard(id): void; cardsForJob(jobId): WorkCard[]; refresh(): Promise<void> }`
  - `export function rowToCard(r): WorkCard` / `export function cardToRow(c): Record<string,unknown>` (pure mappers — what the test exercises).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-work-cards.ts`:
```ts
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { rowToCard, cardToRow } from "../features/shop/lib/workCardsStore";

let passed = 0;
function check(label: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${label}`); }

console.log("work cards row mapping");

check("rowToCard maps snake_case → camelCase with null-safety", () => {
  const c = rowToCard({
    id: "k1", job_id: "j1", phase_id: "assembly", operation_id: "op1",
    description: "Assemble base ×13", target_quantity: "13", assignee_id: null,
    status: "todo", stuck_reason: null, source: "budget", sort: 0,
  });
  assert.equal(c.jobId, "j1");
  assert.equal(c.phaseId, "assembly");
  assert.equal(c.operationId, "op1");
  assert.equal(c.targetQuantity, 13); // numeric strings coerced
  assert.equal(c.assigneeId, null);
  assert.equal(c.status, "todo");
  assert.equal(c.source, "budget");
});

check("cardToRow round-trips (camelCase → snake_case)", () => {
  const row = cardToRow({
    id: "k1", jobId: "j1", phaseId: "assembly", operationId: null,
    description: "Site cleanup", targetQuantity: null, assigneeId: null,
    status: "todo", stuckReason: null, source: "manual", sort: 2,
  });
  assert.equal(row.job_id, "j1");
  assert.equal(row.operation_id, null);
  assert.equal(row.source, "manual");
  assert.equal(row.sort, 2);
});

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-work-cards.ts`
Expected: FAIL — `rowToCard`/`cardToRow` not exported.

- [ ] **Step 3: Implement `workCardsStore.tsx`**

Create `features/shop/lib/workCardsStore.tsx` modeled on `features/shop/lib/shopStore.tsx` (dual-mode). Key parts:

```tsx
"use client";
import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";

export type WorkCardStatus = "todo" | "doing" | "stuck" | "done";
export type WorkCardSource = "budget" | "template" | "manual";

export type WorkCard = {
  id: string;
  jobId: string;
  phaseId: string;
  operationId: string | null;
  description: string;
  targetQuantity: number | null;
  assigneeId: string | null;
  status: WorkCardStatus;
  stuckReason: string | null;
  source: WorkCardSource;
  sort: number;
};
export type NewWorkCard = Omit<WorkCard, "id">;

const TABLE = "work_cards";
const LS_KEY = "gw_work_cards_v1";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function rowToCard(r: Record<string, unknown>): WorkCard {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    phaseId: String(r.phase_id),
    operationId: (r.operation_id as string) ?? null,
    description: (r.description as string) ?? "",
    targetQuantity: num(r.target_quantity),
    assigneeId: (r.assignee_id as string) ?? null,
    status: (r.status as WorkCardStatus) ?? "todo",
    stuckReason: (r.stuck_reason as string) ?? null,
    source: (r.source as WorkCardSource) ?? "manual",
    sort: num(r.sort) ?? 0,
  };
}
export function cardToRow(c: WorkCard): Record<string, unknown> {
  return {
    id: c.id, job_id: c.jobId, phase_id: c.phaseId, operation_id: c.operationId,
    description: c.description, target_quantity: c.targetQuantity, assignee_id: c.assigneeId,
    status: c.status, stuck_reason: c.stuckReason, source: c.source, sort: c.sort,
  };
}

type Ctx = {
  cards: WorkCard[]; loading: boolean; error: string | null;
  addCard: (c: NewWorkCard) => Promise<string>;
  updateCard: (id: string, patch: Partial<WorkCard>) => void;
  removeCard: (id: string) => void;
  cardsForJob: (jobId: string) => WorkCard[];
  refresh: () => Promise<void>;
};
const WorkCardsContext = createContext<Ctx | null>(null);

function localLoad(): WorkCard[] {
  if (typeof window === "undefined") return [];
  try { const raw = window.localStorage.getItem(LS_KEY); return raw ? (JSON.parse(raw) as WorkCard[]) : []; }
  catch { return []; }
}
function localSave(cards: WorkCard[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(cards)); } catch { /* silent */ }
}
function newId(): string { return `wc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

export function WorkCardsProvider({ children }: { children: ReactNode }) {
  const isSb = hasSupabase();
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSb) { setCards(localLoad()); setLoading(false); return; }
    try {
      const { data, error } = await getSupabase().from(TABLE).select("*").order("sort");
      if (error) throw error;
      setCards((data ?? []).map(rowToCard)); setError(null);
    } catch (e) { setError(formatError(e)); setCards(localLoad()); }
    finally { setLoading(false); }
  }, [isSb]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!loading && !isSb) localSave(cards); }, [cards, loading, isSb]);

  const addCard = useCallback(async (c: NewWorkCard) => {
    const card: WorkCard = { ...c, id: newId() };
    setCards((prev) => [...prev, card]);
    if (isSb) {
      try { const { error } = await getSupabase().from(TABLE).insert(cardToRow(card)); if (error) throw error; setError(null); }
      catch (e) { setError(formatError(e)); setCards((prev) => prev.filter((x) => x.id !== card.id)); }
    }
    return card.id;
  }, [isSb]);

  const updateCard = useCallback((id: string, patch: Partial<WorkCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (isSb) {
      const row: Record<string, unknown> = {};
      if ("status" in patch) row.status = patch.status;
      if ("stuckReason" in patch) row.stuck_reason = patch.stuckReason;
      if ("assigneeId" in patch) row.assignee_id = patch.assigneeId;
      if ("operationId" in patch) row.operation_id = patch.operationId;
      if ("phaseId" in patch) row.phase_id = patch.phaseId;
      if ("description" in patch) row.description = patch.description;
      if ("targetQuantity" in patch) row.target_quantity = patch.targetQuantity;
      if ("sort" in patch) row.sort = patch.sort;
      if (Object.keys(row).length > 0) {
        void getSupabase().from(TABLE).update(row).eq("id", id).then(({ error }) => { if (error) setError(formatError(error)); });
      }
    }
  }, [isSb]);

  const removeCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (isSb) void getSupabase().from(TABLE).delete().eq("id", id).then(({ error }) => { if (error) setError(formatError(error)); });
  }, [isSb]);

  const cardsForJob = useCallback((jobId: string) => cards.filter((c) => c.jobId === jobId), [cards]);

  return (
    <WorkCardsContext.Provider value={{ cards, loading, error, addCard, updateCard, removeCard, cardsForJob, refresh }}>
      {children}
    </WorkCardsContext.Provider>
  );
}
export function useWorkCards(): Ctx {
  const ctx = useContext(WorkCardsContext);
  if (!ctx) throw new Error("useWorkCards must be used inside <WorkCardsProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-work-cards.ts` → expect `2 checks passed.`

- [ ] **Step 5: Typecheck + commit**

Run `npx tsc --noEmit` (clean).
```bash
git add features/shop/lib/workCardsStore.tsx scripts/test-work-cards.ts
git commit -m "feat(shop): useWorkCards store (dual-mode) + row mappers (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Seed cards from the budget at Save-as-Job

When a job's labour budget freezes, generate one `todo` card per code.

**Files:**
- Create: `features/job-costing/lib/seedWorkCards.ts`
- Modify: `features/job-costing/lib/saveBudget.ts`
- Test: `scripts/test-seed-work-cards.ts`

**Interfaces:**
- Consumes: `CostCodeBudget` / `CostCodeBudgetRow` from `./budget`; `hasSupabase`, `getSupabase`.
- Produces: `export function workCardRowsFromBudget(jobId: string, budget: CostCodeBudget, codeToId: Map<string,string>): Record<string,unknown>[]` (pure — tested); `export async function seedWorkCardsFromBudget(jobId, budget, codeToId): Promise<number>` (Supabase insert; no-op without Supabase).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-seed-work-cards.ts`:
```ts
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { workCardRowsFromBudget } from "../features/job-costing/lib/seedWorkCards";
import { deriveCostCodeBudget, FULL_BUILD_CODE_SET } from "../features/job-costing/lib/budget";
import { registryFromDefs, CANONICAL_COST_CODES } from "../features/job-costing/lib/costCodes";
import { emptyCabinetSummary, DEFAULT_LABOUR_RATES } from "../features/estimator/lib/types";

let passed = 0;
function check(label: string, fn: () => void) { fn(); passed++; console.log(`  ✓ ${label}`); }

const cab = emptyCabinetSummary();
cab.base = { count: 13, linearFt: 0 };
const REG = registryFromDefs(CANONICAL_COST_CODES);
const budget = deriveCostCodeBudget(FULL_BUILD_CODE_SET, cab, DEFAULT_LABOUR_RATES, REG);
const codeToId = new Map(CANONICAL_COST_CODES.map((c) => [c.code, `id-${c.code}`]));
const rows = workCardRowsFromBudget("job1", budget, codeToId);

check("one card row per code that carries time/quantity, source=budget, status=todo", () => {
  const asmBase = rows.find((r) => r.operation_id === "id-ASM-BASE");
  assert.ok(asmBase, "ASM-BASE card created");
  assert.equal(asmBase!.job_id, "job1");
  assert.equal(asmBase!.phase_id, "assembly");
  assert.equal(asmBase!.target_quantity, 13);
  assert.equal(asmBase!.status, "todo");
  assert.equal(asmBase!.source, "budget");
  assert.ok(String(asmBase!.description).length > 0);
});

check("zero-quantity / zero-amount codes are skipped (no empty cards)", () => {
  // ASM-ISLAND has 0 cabinets here → no card
  assert.equal(rows.find((r) => r.operation_id === "id-ASM-ISLAND"), undefined);
});

console.log(`\n${passed} checks passed.`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-seed-work-cards.ts` → FAIL (`workCardRowsFromBudget` missing).

- [ ] **Step 3: Implement `seedWorkCards.ts`**

```ts
// Seed shop-floor work cards from a frozen labour budget (Slice B Part 1). One
// 'todo' card per budgeted code, in its phase, with the budget's target quantity.
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import type { CostCodeBudget } from "./budget";

export function workCardRowsFromBudget(
  jobId: string,
  budget: CostCodeBudget,
  codeToId: Map<string, string>,
): Record<string, unknown>[] {
  return budget.rows
    .filter((r) => r.budgetedMinutes > 0 || r.amount > 0)
    .map((r, i) => ({
      job_id: jobId,
      phase_id: r.phaseId,
      operation_id: codeToId.get(r.code) ?? null,
      description: r.name,
      target_quantity: r.driver ? r.quantity : null,
      status: "todo",
      source: "budget",
      sort: i,
    }));
}

export async function seedWorkCardsFromBudget(
  jobId: string,
  budget: CostCodeBudget,
  codeToId: Map<string, string>,
): Promise<number> {
  if (!hasSupabase()) return 0;
  const rows = workCardRowsFromBudget(jobId, budget, codeToId);
  if (rows.length === 0) return 0;
  const { error } = await getSupabase().from("work_cards").insert(rows);
  if (error) throw error;
  return rows.length;
}
```

- [ ] **Step 4: Wire into `saveJobBudget`**

In `features/job-costing/lib/saveBudget.ts`, after the `job_cost_budgets` insert succeeds and before `return`, add (the `codeToId` map already exists in that function from the code-id lookup):
```ts
  // Seed shop-floor work cards from the frozen budget (Slice B). Non-fatal.
  try {
    const { seedWorkCardsFromBudget } = await import("./seedWorkCards");
    await seedWorkCardsFromBudget(input.jobId, input.budget, codeToId);
  } catch (e) {
    console.warn("Failed to seed work cards:", e);
  }
```
(If the existing `codeToId` variable has a different name, use that name. The dynamic import keeps `seedWorkCards` out of the estimator bundle.)

- [ ] **Step 5: Run test + typecheck**

Run: `npx tsx scripts/test-seed-work-cards.ts` → `2 checks passed.`
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add features/job-costing/lib/seedWorkCards.ts features/job-costing/lib/saveBudget.ts scripts/test-seed-work-cards.ts
git commit -m "feat(job-costing): seed work cards from the frozen budget at Save-as-Job (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `WorkCardItem` — the card with capture (pace timer per worker)

A presentational-ish card that shows the task + lets a worker clock it via the existing `TaskTimer`. Mounts inside the per-job board (Task 6).

**Files:**
- Create: `features/shop/components/WorkCardItem.tsx`

**Interfaces:**
- Consumes: `WorkCard` (Task 3); `useLabour()` (`startTimer`, `stopTimer`, `pauseTimer`, `resumeTimer`, `running`, `sessions`, `workers`, `operationById`); `TaskTimer` + `suggestedMinutes` from labour; `useNow` from labour; `useWorkCards().updateCard`.
- Produces: `export function WorkCardItem({ card, workers, now }: { card: WorkCard; workers: LabourWorker[]; now: number })`.

- [ ] **Step 1: Implement the component**

Create `features/shop/components/WorkCardItem.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Play, AlertTriangle, Check } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useLabour, type LabourWorker } from "@features/labour/lib/labourStore";
import { TaskTimer } from "@features/labour/components/TaskTimer";
import { suggestedMinutes } from "@features/labour/lib/pace";
import { useWorkCards, type WorkCard } from "../lib/workCardsStore";

export function WorkCardItem({ card, workers, now }: { card: WorkCard; workers: LabourWorker[]; now: number }) {
  const { startTimer, stopTimer, pauseTimer, resumeTimer, running, sessions, operationById } = useLabour();
  const { updateCard } = useWorkCards();
  const [pickWorker, setPickWorker] = useState("");

  // Sessions running against THIS card (many workers → many sessions).
  const cardRunning = running.filter((s) => s.cardId === card.id);
  const op = card.operationId ? operationById.get(card.operationId) : undefined;
  const completed = card.operationId ? sessions.filter((s) => s.operationId === card.operationId && s.endedAt) : [];

  function startFor(workerId: string) {
    if (!card.operationId) return; // uncoded cards can't time against a code yet (Task 7 lets you assign one)
    startTimer({
      operationId: card.operationId,
      workerId: workerId || null,
      jobId: card.jobId,
      cardId: card.id,
      targetQuantity: card.targetQuantity,
    });
    if (card.status === "todo") updateCard(card.id, { status: "doing" });
    setPickWorker("");
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3 space-y-2 shadow-resting">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-text-primary">{card.description}</div>
          <div className="text-caption text-text-tertiary">
            {card.operationId ? (op?.code ?? "") : "uncoded"}
            {card.targetQuantity != null ? ` · target ${card.targetQuantity}` : ""}
          </div>
        </div>
        {card.status === "stuck" && (
          <span className="inline-flex items-center gap-1 text-caption text-status-at-risk">
            <AlertTriangle className="h-3 w-3" /> stuck
          </span>
        )}
      </div>

      {/* Running timers (one per worker) */}
      {cardRunning.map((s) => {
        const suggested = op ? suggestedMinutes(op, completed, s.targetQuantity, null) : { minutes: null, source: null, sampleCount: 0 };
        return (
          <TaskTimer
            key={s.id}
            session={s}
            title={card.description}
            meta={{ worker: workers.find((w) => w.id === s.workerId)?.name ?? null }}
            driverUnit={op?.driverUnit ?? null}
            suggested={suggested}
            estimateMinutes={null}
            now={now}
            onPause={() => pauseTimer(s.id)}
            onResume={() => resumeTimer(s.id)}
            onStop={(quantity) => stopTimer(s.id, quantity)}
          />
        );
      })}

      {/* Start control: pick a worker → Start (only for coded cards not done) */}
      {card.status !== "done" && card.operationId && (
        <div className="flex items-center gap-2">
          <select
            value={pickWorker}
            onChange={(e) => setPickWorker(e.target.value)}
            className="flex-1 rounded-md bg-surface-muted border border-border px-2 py-1 text-sm text-text-primary"
            aria-label="Pick a worker to start"
          >
            <option value="">Worker…</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button
            onClick={() => startFor(pickWorker)}
            disabled={!pickWorker}
            className="inline-flex items-center gap-1 rounded-full bg-ink-pill text-white px-3 py-1 text-sm disabled:bg-text-disabled disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        </div>
      )}

      {/* Status actions */}
      <div className="flex items-center gap-3 text-caption">
        {card.status !== "done" && (
          <button onClick={() => updateCard(card.id, { status: "done" })} className="inline-flex items-center gap-1 text-status-on-track">
            <Check className="h-3 w-3" /> Mark done
          </button>
        )}
        {card.status !== "stuck" ? (
          <button
            onClick={() => { const r = window.prompt("What's it waiting on?") ?? ""; updateCard(card.id, { status: "stuck", stuckReason: r }); }}
            className="text-status-at-risk"
          >Flag stuck</button>
        ) : (
          <button onClick={() => updateCard(card.id, { status: "doing", stuckReason: null })} className="text-text-tertiary">Unstick</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (If `LabourWorker` isn't exported from `labourStore`, add `export` to its type there — confirm via the type's declaration.)

- [ ] **Step 3: Commit**

```bash
git add features/shop/components/WorkCardItem.tsx
git commit -m "feat(shop): WorkCardItem — per-worker pace-timer capture on a card (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Per-job board — 6 phase columns of cards

**Files:**
- Create: `features/shop/components/JobBoard.tsx`

**Interfaces:**
- Consumes: `useWorkCards().cardsForJob`, `useLabour()` (`workers`), `useNow`; `WorkCardItem` (Task 5); `MILESTONE_STAGES`/`MilestoneStage` from `@shared/lib/types` (the 6 phases) — or `PHASE_ORDER`/`PHASE_LABELS` from `@features/job-costing/lib/costCodes`.
- Produces: `export function JobBoard({ jobId, jobName }: { jobId: string; jobName: string })`.

- [ ] **Step 1: Implement the per-job board**

Create `features/shop/components/JobBoard.tsx`:
```tsx
"use client";
import { useLabour } from "@features/labour/lib/labourStore";
import { useNow } from "@features/labour/lib/labourStore";
import { PHASE_ORDER, PHASE_LABELS, type PhaseId } from "@features/job-costing/lib/costCodes";
import { useWorkCards } from "../lib/workCardsStore";
import { WorkCardItem } from "./WorkCardItem";

export function JobBoard({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { cardsForJob } = useWorkCards();
  const { workers } = useLabour();
  const now = useNow();
  const cards = cardsForJob(jobId);

  return (
    <div>
      <h2 className="text-base font-semibold text-text-primary mb-3">{jobName}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PHASE_ORDER.map((phase: PhaseId) => {
          const inPhase = cards.filter((c) => c.phaseId === phase).sort((a, b) => a.sort - b.sort);
          return (
            <div key={phase} className="bg-surface-muted/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-caption font-medium uppercase tracking-[0.04em] text-text-secondary">{PHASE_LABELS[phase]}</h3>
                <span className="text-caption text-text-tertiary">{inPhase.length}</span>
              </div>
              <div className="space-y-2">
                {inPhase.length === 0 ? (
                  <p className="text-caption text-text-tertiary">No cards.</p>
                ) : (
                  inPhase.map((card) => <WorkCardItem key={card.id} card={card} workers={workers} now={now} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
(`useNow` is exported from `labourStore` per the labour CLAUDE.md — confirm the export name; if it's `useNow` re-exported elsewhere, import from there.)

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add features/shop/components/JobBoard.tsx
git commit -m "feat(shop): per-job 6-phase board of work cards (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Shop-wide summary + manual add + 'Needs a code' triage

The `/shop` landing: a shop-wide summary (Needs attention / Running now / Needs a code) and entry into a job board. Add a manual card (description + phase required, optional code) and assign a code to an uncoded card.

**Files:**
- Create: `features/shop/components/ShopFloorView.tsx`
- Create: `features/shop/components/AddCardModal.tsx`

**Interfaces:**
- Consumes: `useWorkCards`, `useLabour` (workers, operations, running, operationById), `useJobs` (jobs, for names + the job picker), `PHASE_ORDER`/`PHASE_LABELS`; `JobBoard` (Task 6).
- Produces: `export function ShopFloorView()` (top-level, rendered by the route); `export function AddCardModal({ open, jobId, onClose })`.

- [ ] **Step 1: Implement `AddCardModal`** (manual card: description required, phase required, optional code from the live registry — pick existing only; no code-create here)

Create `features/shop/components/AddCardModal.tsx` — a modal with: a **description** textarea (required), a **phase** select (the 6 `PHASE_ORDER`), an optional **cost code** select populated from `useLabour().operations` filtered to `op.code != null` (display `code — name`; picking one sets `operationId` and forces `phaseId` to the op's `categoryId`), and an **assignee** select (workers). On submit calls `useWorkCards().addCard({ jobId, phaseId, operationId, description, targetQuantity: null, assigneeId, status: "todo", stuckReason: null, source: "manual", sort: 999 })`. Disable submit until description + phase are set. Use the modal/token patterns from `features/shop/components/AndonModal.tsx` (existing) for styling consistency.

- [ ] **Step 2: Implement `ShopFloorView`**

Create `features/shop/components/ShopFloorView.tsx`:
```tsx
"use client";
import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useWorkCards } from "../lib/workCardsStore";
import { useLabour } from "@features/labour/lib/labourStore";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { JobBoard } from "./JobBoard";
import { AddCardModal } from "./AddCardModal";

export function ShopFloorView() {
  const { cards, updateCard } = useWorkCards();
  const { running, workerById, operationById } = useLabour();
  const { jobs } = useJobs();
  const [jobId, setJobId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const jobName = (id: string) => jobs.find((j) => j.id === id)?.name ?? id;
  const stuck = cards.filter((c) => c.status === "stuck");
  const uncoded = cards.filter((c) => !c.operationId && c.status !== "done");

  return (
    <>
      <PageHeader eyebrow="Shop floor" title="Work board"
        subtitle="Cards are tasks on a job. Tap your name + Start to clock time against a cost code." />
      <div className="px-6 py-5 space-y-5 max-w-6xl">
        {/* Needs attention (stuck) */}
        {stuck.length > 0 && (
          <section className="bg-status-at-risk-soft rounded-lg p-3">
            <h3 className="text-caption font-medium text-status-at-risk mb-1">⚠ Needs attention</h3>
            {stuck.map((c) => (
              <div key={c.id} className="text-sm text-text-primary">
                {c.description} — <span className="text-status-at-risk">stuck</span>
                {c.stuckReason ? `: ${c.stuckReason}` : ""} · {jobName(c.jobId)}
              </div>
            ))}
          </section>
        )}

        {/* Running now */}
        <section>
          <h3 className="text-caption uppercase tracking-[0.04em] text-text-tertiary mb-1">Running now ({running.length})</h3>
          {running.length === 0 ? <p className="text-sm text-text-tertiary">Nothing running.</p> : (
            running.map((s) => (
              <div key={s.id} className="text-sm text-text-secondary">
                {workerById.get(s.workerId ?? "")?.name ?? "—"} · {operationById.get(s.operationId ?? "")?.name ?? "—"} · {jobName(s.jobId ?? "")}
              </div>
            ))
          )}
        </section>

        {/* Needs a code triage (admin) */}
        {uncoded.length > 0 && (
          <section className="bg-surface border border-border rounded-lg p-3">
            <h3 className="text-caption font-medium text-text-secondary mb-1">Needs a code ({uncoded.length})</h3>
            {uncoded.map((c) => (
              <UncodedRow key={c.id} description={c.description} job={jobName(c.jobId)}
                onAssign={(opId, phaseId) => updateCard(c.id, { operationId: opId, phaseId })} />
            ))}
            <p className="text-caption text-text-tertiary mt-1">Create new codes in /labour → Setup.</p>
          </section>
        )}

        {/* Job picker → per-job board */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}
              className="rounded-md bg-surface-muted border border-border px-2 py-1.5 text-sm text-text-primary">
              <option value="">Pick a job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
            </select>
            {jobId && (
              <button onClick={() => setAddOpen(true)} className="text-sm text-accent">+ Add card</button>
            )}
          </div>
          {jobId && <JobBoard jobId={jobId} jobName={jobName(jobId)} />}
        </section>
      </div>
      {jobId && <AddCardModal open={addOpen} jobId={jobId} onClose={() => setAddOpen(false)} />}
    </>
  );
}

function UncodedRow({ description, job, onAssign }: { description: string; job: string; onAssign: (opId: string, phaseId: string) => void }) {
  const { operations } = useLabour();
  const coded = operations.filter((o) => o.code);
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
      <span className="text-text-secondary truncate">{description} · {job}</span>
      <select defaultValue="" onChange={(e) => {
          const op = coded.find((o) => o.id === e.target.value);
          if (op && op.categoryId) onAssign(op.id, op.categoryId);
        }}
        className="rounded-md bg-surface-muted border border-border px-2 py-1 text-caption text-text-primary">
        <option value="">Assign code…</option>
        {coded.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add features/shop/components/ShopFloorView.tsx features/shop/components/AddCardModal.tsx
git commit -m "feat(shop): shop-wide summary + manual add + Needs-a-code triage (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire up — provider, route, retire the old station board

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/shop/page.tsx`
- Modify: `features/shop/CLAUDE.md`
- Delete (retire): `features/shop/components/ShopBoard.tsx`, `ShopColumn.tsx`, `WorkUnitCard.tsx`, `NewUnitModal.tsx`, `UnitModal.tsx`, `AndonBanner.tsx`, `AndonModal.tsx`, `features/shop/lib/shopStore.tsx` — and the `ShopProvider` mount.

> NOTE: project rules forbid `rm`. "Retire" = remove the imports/usages and the `ShopProvider` mount so the files are dead, then leave the files in place (or the controller deletes via git in the commit). Simplest safe path: stop importing them; replace the route + provider; the dead files stay but are unreferenced. Mention the dead files in the commit so a later cleanup can remove them.

- [ ] **Step 1: Mount `WorkCardsProvider`, drop `ShopProvider`**

In `src/app/layout.tsx`: replace the `<ShopProvider>…</ShopProvider>` wrapper (line ~52) with `<WorkCardsProvider>…</WorkCardsProvider>` (import from `@features/shop/lib/workCardsStore`), keeping the same children nesting. Remove the `ShopProvider` import.

- [ ] **Step 2: Repoint the `/shop` route**

Replace `src/app/shop/page.tsx` with:
```tsx
import { ShopFloorView } from "@features/shop/components/ShopFloorView";

export default function ShopPage() {
  return <ShopFloorView />;
}
```

- [ ] **Step 3: Update `features/shop/CLAUDE.md`**

Rewrite it to describe the new board: work cards on the 6-phase spine, per-worker capture via the pace timer, `stuck` + Needs-attention, Needs-a-code triage, seeding from the budget; note the old `shop_units` station board + Andon are retired (files dead, `shop_units`/`andon_events` tables unused, drop in a later cleanup).

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → "Compiled successfully", `/shop` listed. (Catches any lingering import of a retired file.)

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/shop/page.tsx features/shop/CLAUDE.md
git commit -m "feat(shop): mount WorkCardsProvider, repoint /shop, retire the station board (Slice B Part 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verify — full gate + authenticated browser smoke

**Files:** none (verification only).

- [ ] **Step 1: Full static gate**

Run: `npx tsc --noEmit` (clean), `npm run lint` ("No ESLint warnings or errors"), `npm run build` ("Compiled successfully").

- [ ] **Step 2: All tsx suites**

Run: `npx tsx scripts/test-work-cards.ts && npx tsx scripts/test-seed-work-cards.ts` → `2` / `2`. (Plus the Slice A suites still green: `test-cost-code-registry`, `test-job-costing-budget`, `test-mozaik-import`, `test-bom-catalog-match`.)

- [ ] **Step 3: Authenticated browser smoke**

Reset the smoke user password (GoTrue admin REST, service-role key in `.env.local`; see `.remember`), start `npm run dev`, log in via Playwright (`claude-smoke-test@spacecraftjoinery.local`). Then:
1. In `/estimator`: build a tiny estimate (set base cabinets = 4), client+project, **Save as Job** → confirm (via Supabase MCP `select count(*) from work_cards where job_id = <new job>`) that cards seeded (one per budgeted code).
2. Open `/shop` → pick the job → confirm the per-job board shows the cards in their phase columns.
3. On a coded card (e.g. ASM-BASE): pick a worker → **Start** → confirm a `labour_session` row tagged `(worker_id, job_id, operation_id, card_id)` (Supabase MCP). **Stop** with a quantity → confirm `ended_at` + `quantity` set, and the card → `doing`.
4. Flag another card **stuck** → confirm it appears in "Needs attention".
5. Add a **manual uncoded card** (description, phase) → confirm it appears in "Needs a code"; assign a code → confirm `operation_id` set.
6. Screenshot `/tmp/slice-b-part1.png`. Stop dev. Clean up any smoke rows (delete the test job's cards/sessions via MCP).

- [ ] **Step 4: `impeccable` pass on the board UI**

Per the standard workflow, run the `impeccable` skill on `/shop` (the new board) — visual hierarchy, the card, the phase columns, the attention/triage bands, empty states, mobile. Apply its high-confidence polish; re-run the gate after.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(shop): Slice B Part 1 verified — capture board green + impeccable polish

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against the Slice B spec, Part-1 scope):
- 6-phase board, card per cost code → Tasks 3, 6. ✓
- Cards seed from budget → Task 4; manual add (description required) → Task 7. ✓
- Per-worker pace-timer capture, many workers per card, session tagged job+code+card+qty → Tasks 2, 5. ✓
- `stuck` + "Needs attention" → Tasks 5, 7. ✓
- Code-optional + "Needs a code" triage; assign existing code on the board; code-create stays in /labour → Task 7. ✓
- Cards don't drag between columns (status only) → Tasks 5, 6 (no DnD). ✓
- Retire `shop_units` station board → Task 8. ✓
- `job_id` uuid→text + `card_id` → Task 1. ✓
- *Deferred to Part 2:* daily time cards (roll-up views, corrections, CSV). *Deferred to Slice B-blockers:* external blockers. *Not in scope:* pay rates/payroll $, logins, milestone nudge (Part 2/later).

**Placeholder scan:** no TBD/TODO; UI tasks (5, 7) include full component code; Task 7 Step 1 (`AddCardModal`) is described against the existing `AndonModal` pattern rather than fully coded — the implementer builds a standard modal from the named existing example + the exact `addCard` payload given. (Acceptable: it's a conventional form, the data contract is exact.)

**Type consistency:** `WorkCard` fields (camelCase) consistent across Tasks 3/5/6/7; `cardId` on `LabourSession` (Task 2) consumed in Task 5 (`running.filter(s => s.cardId === card.id)`); `startTimer({…cardId})` (Task 2) called in Task 5; `seedWorkCardsFromBudget(jobId, budget, codeToId)` (Task 4) matches the `saveJobBudget` wiring. `PHASE_ORDER`/`PHASE_LABELS` (costCodes.ts) used in Tasks 6/7.

**Open confirmations for the implementer (verify against code, don't guess):** `useNow` export location (labourStore vs a shared hook); `LabourWorker` is exported from `labourStore`; the `codeToId` variable name inside `saveJobBudget`.
