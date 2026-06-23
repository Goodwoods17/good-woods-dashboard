# External Blockers (Slice B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Structured external blockers on a job (`job_blockers` table) that are the source of truth for the job's effective health + blocker chip, surface in Hitlist / Schedule / pipeline / briefing / shop board, and soft-gate a phase's milestone advance.

**Architecture:** Data (`job_blockers` table + `JobBlocker` type + row mapper) → dual-mode `jobBlockersStore` → pure derivation (`jobBlockers.ts`) → consumers (existing `deriveHealth`/`resolveBlocker*`/`buildHitlist` gain an optional `activeBlockers` arg; new JobDetail card; soft gate; shop chip; briefing). Spec: `docs/superpowers/specs/2026-06-22-external-blockers-design.md`. ADR: `docs/decisions/0013-external-blockers-structured-source-of-truth.md`.

**Tech Stack:** Next.js 14 / React 18 / TS strict, Supabase (`@supabase/ssr`), `tsx` `node:assert/strict` tests, Tailwind tokens.

## Global Constraints

- Path aliases (`@features/*`, `@shared/*`); TS strict; no `Set`/`Map` spread or `for…of` over a `Set` (use `Array.from(map.values())`).
- Tests: no jest — `tsx` `node:assert/strict` scripts under `scripts/`, run `npx tsx scripts/<name>.ts`.
- Tailwind design tokens only (`bg-surface`, `bg-surface-muted`, `border-border`, `text-text-{primary,secondary,tertiary}`, `bg-ink-pill`, `text-white`, `status-blocked`/`status-blocked-soft`/`status-at-risk`, `shadow-resting`, `rounded-{md,lg,xl,2xl,full}`, `duration-fast`). No hardcoded hex. Money (none here) via `formatCAD`.
- **`PhaseId` (`@features/job-costing/lib/costCodes`) === `MilestoneStage` (`@shared/lib/types`)** — identical 6 keys `design|cnc|assembly|finishing|delivery|install`. `gated_phase_id` stores one of these.
- **Health precedence:** `complete` > manual `paused` > active-blocker → `blocked` > schedule-derived. `activeBlockers` defaults to `[]` (backward-compatible) but every call site is updated to pass it.
- **Whole-job blocker** (`gated_phase_id = null`) flags health only; **only a phase-specific blocker gates that phase's advance** (soft warn, allow).
- Dual-mode parity: Supabase when configured, else localStorage — mirror `features/shop/lib/workCardsStore.tsx` exactly.
- RLS authenticated-only on `job_blockers` (match `work_cards`).
- Per-task gate: `npx tsc --noEmit` clean + the task's tsx test green. Full gate (`lint`, `build`, browser smoke) at the final task.
- Commit after each task; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Migration + `JobBlocker` type + row mapper

**Files:**
- Create: `supabase/migrations/<TS>_job_blockers.sql`
- Modify: `shared/lib/types.ts` (add `JobBlocker`)
- Create: `features/jobs/lib/jobBlockerRowMap.ts`, `scripts/test-job-blocker-rowmap.ts`

**Interfaces:**
- Produces: `JobBlocker` type; `rowToBlocker(r) → JobBlocker`; `blockerToRow(b) → Record<string,unknown>`.

- [ ] **Step 1: Write the migration** (idempotent; apply via Supabase MCP `apply_migration`, then rename the repo file to the recorded version — migration-drift lesson). RLS authenticated-only, partial index on active rows.

```sql
-- job_blockers: structured external blockers (ADR 0013). Source of truth for a
-- job's externally-blocked health. job_id is text (jobs PK is text).
create table if not exists public.job_blockers (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  reason text not null,
  waiting_on_contact_id uuid references public.contacts(id) on delete set null,
  waiting_on_label text,
  gated_phase_id text,
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_blockers_active_idx
  on public.job_blockers (job_id) where resolved_at is null;

alter table public.job_blockers enable row level security;
do $$ begin
  create policy "job_blockers_auth_all" on public.job_blockers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Add `JobBlocker` to `shared/lib/types.ts`** (near `Job`; import-free shape):
```ts
export type JobBlocker = {
  id: string;
  jobId: string;
  reason: string;
  waitingOnContactId: string | null;
  waitingOnLabel: string | null;
  gatedPhaseId: MilestoneStage | null;
  raisedAt: string;       // ISO
  resolvedAt: string | null;
};
```

- [ ] **Step 3: Write the failing row-mapper test** `scripts/test-job-blocker-rowmap.ts`:
```ts
/* eslint-disable no-console */
import assert from "node:assert/strict";
import { rowToBlocker, blockerToRow } from "../features/jobs/lib/jobBlockerRowMap";

let passed = 0;
function check(l: string, f: () => void) { f(); passed++; console.log(`  ✓ ${l}`); }

const row = {
  id: "b1", job_id: "4", reason: "client sign-off",
  waiting_on_contact_id: null, waiting_on_label: "Richelieu rep",
  gated_phase_id: "design", raised_at: "2026-06-20T00:00:00.000Z", resolved_at: null,
};
check("rowToBlocker maps snake→camel incl nulls", () => {
  const b = rowToBlocker(row);
  assert.equal(b.jobId, "4");
  assert.equal(b.waitingOnContactId, null);
  assert.equal(b.waitingOnLabel, "Richelieu rep");
  assert.equal(b.gatedPhaseId, "design");
  assert.equal(b.resolvedAt, null);
});
check("blockerToRow round-trips back to snake", () => {
  const r = blockerToRow(rowToBlocker(row));
  assert.equal(r.job_id, "4");
  assert.equal(r.gated_phase_id, "design");
  assert.equal(r.waiting_on_label, "Richelieu rep");
});
console.log(`\n${passed} checks passed.`);
```
Run → fails (module missing).

- [ ] **Step 4: Implement `features/jobs/lib/jobBlockerRowMap.ts`:**
```ts
import type { JobBlocker, MilestoneStage } from "@shared/lib/types";

export function rowToBlocker(r: Record<string, unknown>): JobBlocker {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    reason: (r.reason as string) ?? "",
    waitingOnContactId: (r.waiting_on_contact_id as string) ?? null,
    waitingOnLabel: (r.waiting_on_label as string) ?? null,
    gatedPhaseId: (r.gated_phase_id as MilestoneStage) ?? null,
    raisedAt: String(r.raised_at),
    resolvedAt: (r.resolved_at as string) ?? null,
  };
}
export function blockerToRow(b: JobBlocker): Record<string, unknown> {
  return {
    id: b.id, job_id: b.jobId, reason: b.reason,
    waiting_on_contact_id: b.waitingOnContactId,
    waiting_on_label: b.waitingOnLabel,
    gated_phase_id: b.gatedPhaseId,
    raised_at: b.raisedAt, resolved_at: b.resolvedAt,
  };
}
```
Run → `2 checks passed.` `npx tsc --noEmit` clean. Commit (`feat(jobs): job_blockers table + JobBlocker type + row mapper (B2)`).

---

### Task 2: `jobBlockersStore` (dual-mode) + mount provider

**Files:** Create `features/jobs/lib/jobBlockersStore.tsx`; Modify `src/app/layout.tsx` (mount provider).

**Interfaces:**
- Produces `useJobBlockers()` → `{ blockers: JobBlocker[]; loading; error; activeByJob: Map<string, JobBlocker[]>; activeForJob(jobId): JobBlocker[]; addBlocker(b: NewJobBlocker): Promise<string>; resolveBlocker(id): void; reopenBlocker(id): void; refresh(): Promise<void> }` where `NewJobBlocker = Omit<JobBlocker, "id" | "raisedAt" | "resolvedAt">`.

- [ ] **Step 1: Implement the store** — copy the structure of `features/shop/lib/workCardsStore.tsx` exactly (same `isSb`/`refresh`/`localLoad`/`localSave`/`newId` shape, `TABLE = "job_blockers"`, `LS_KEY = "gw_job_blockers_v1"`, error via `formatError`). Use `rowToBlocker`/`blockerToRow` from Task 1. Specifics:
  - `refresh`: `getSupabase().from(TABLE).select("*").order("raised_at", { ascending: false })` → `rowToBlocker`.
  - `addBlocker(b)`: build `JobBlocker = { ...b, id: newId(), raisedAt: new Date().toISOString(), resolvedAt: null }`; optimistic prepend; insert `blockerToRow`; rollback on error (mirror `addCard`). Return id.
  - `resolveBlocker(id)`: optimistic set `resolvedAt = new Date().toISOString()`; `update({ resolved_at })`. `reopenBlocker(id)`: set `resolvedAt = null`; `update({ resolved_at: null })`. Both also write `updated_at: new Date().toISOString()`.
  - `activeByJob`: `useMemo(() => { const m = new Map<string, JobBlocker[]>(); for (const b of blockers) { if (b.resolvedAt) continue; const arr = m.get(b.jobId) ?? []; arr.push(b); m.set(b.jobId, arr); } for (const arr of Array.from(m.values())) arr.sort((a,b)=> a.raisedAt < b.raisedAt ? -1 : 1); return m; }, [blockers])` (oldest-first = headline).
  - `activeForJob(jobId)`: `useCallback((jobId) => activeByJob.get(jobId) ?? [], [activeByJob])`.
- [ ] **Step 2: Mount** `<JobBlockersProvider>` in `src/app/layout.tsx` — wrap it around the tree at the same level as `JobsProvider`/`WorkCardsProvider` (find where `WorkCardsProvider` is mounted and nest alongside).
- [ ] **Step 3:** `npx tsc --noEmit` clean. Commit (`feat(jobs): jobBlockersStore (dual-mode) + provider (B2)`).

---

### Task 3: Pure derivation `jobBlockers.ts` + test

**Files:** Create `features/jobs/lib/jobBlockers.ts`, `scripts/test-job-blockers.ts`.

**Interfaces:**
- Consumes `JobBlocker`, `MilestoneStage`.
- Produces:
  - `blockerAgeDays(b: JobBlocker, now: Date): number` — whole days since `raisedAt` (≥0).
  - `partyLabel(b: JobBlocker, contactName: (id: string) => string | undefined): string` — contact name | `waitingOnLabel` | "someone".
  - `headline(active: JobBlocker[]): JobBlocker | null` — oldest active (callers pass the already-sorted `activeForJob`; this just returns `active[0] ?? null`).
  - `externalBlockerChip(active, contactName, now): { text: string; tone: "blocked" } | null` — `text = "Waiting on " + partyLabel(headline) + " · " + days + "d"`; null when `active` empty.
  - `phaseGatingBlocker(active, phase): JobBlocker | null` — first active blocker with `gatedPhaseId === phase`.

- [ ] **Step 1: Write the failing test** `scripts/test-job-blockers.ts` — assert: `blockerAgeDays` (raised 6 days ago → 6); `partyLabel` (contact id resolves to name; null id + label → label; neither → "someone"); `externalBlockerChip` text `"Waiting on Jane · 6d"` + tone `"blocked"`; empty active → null; `phaseGatingBlocker` finds the `design`-gated one and returns null for `install`. (Use fixed `now` dates; build JobBlocker literals.)
- [ ] **Step 2: Run → fails. Step 3: Implement** `jobBlockers.ts` (pure; no React import). `blockerAgeDays`: `Math.max(0, Math.floor((now.getTime() - new Date(b.raisedAt).getTime()) / 86_400_000))`. Guard division/`for…of` rules (iterate arrays, fine).
- [ ] **Step 4: Run → passes. tsc clean. Commit** (`feat(jobs): pure external-blocker derivation helpers (B2)`).

---

### Task 4: Thread `activeBlockers` into health + blocker derivation + Hitlist

**Files:** Modify `features/jobs/lib/health.ts`, `features/jobs/lib/blockers.ts`; Create `scripts/test-health-with-blockers.ts`. Then update call sites: `features/jobs/components/{Hitlist,Schedule,KanbanBoard,JobDetail,BlockerChip}.tsx`.

**Interfaces:**
- `deriveHealth(job, today?, activeBlockers?: JobBlocker[])` — adds 3rd optional param. After the `paused` check and before the schedule rules: `if (activeBlockers && activeBlockers.length > 0) return "blocked";`. (Keeps `complete` first, `paused` second.)
- `resolveBlockerText(job, today?, activeBlockers?)` and `resolveBlockerTone(job, today?, activeBlockers?)` — when `activeBlockers?.length`, return the structured chip (text from `externalBlockerChip` — but text resolution needs a contact name; see note) / tone `"blocked"`, marking it **real** (non-synthetic). `isSyntheticBlocker(job, activeBlockers?)` → `false` when active blockers exist.
- `buildHitlist(jobs, today?, activeByJob?: Map<string, JobBlocker[]>)` — passes `activeByJob.get(job.id) ?? []` into `deriveHealth` so blocked-by-blocker jobs sort to the top.

> **Contact-name note:** `resolveBlockerText`/`Tone` are pure and have no contacts store. Keep them blocker-aware for **tone + health + synthetic flag** (no contact lookup needed). The chip's *party text* (needs a contact name) is composed in the **component layer** (`BlockerChip`), which has access to a contacts lookup — see Step 4. So `resolveBlockerText(job, today, activeBlockers)` returns the headline blocker's `reason` (or `"Externally blocked"`) as fallback text; `BlockerChip` overrides the visible label with `externalBlockerChip(...)` when it can resolve the party. This keeps the lib pure.

- [ ] **Step 1: Write the failing test** `scripts/test-health-with-blockers.ts` — assert precedence with a small `job` fixture + a one-element `activeBlockers`:
  - completed job + active blocker → `"complete"` (complete wins).
  - paused job + active blocker → `"paused"` (paused wins).
  - on-track job + active blocker → `"blocked"` (blocker beats schedule).
  - on-track job + `[]` blockers → unchanged schedule result (regression guard).
  - `resolveBlockerTone(job, today, [blocker])` → `"blocked"`; `isSyntheticBlocker(job, [blocker])` → `false`.
- [ ] **Step 2: Run → fails. Step 3: Implement** the optional-param additions in `health.ts` + `blockers.ts` (keep all existing behavior when the arg is omitted/empty). Update `buildHitlist` signature + the `deriveHealth(job, t)` call inside it to `deriveHealth(job, t, activeByJob?.get(job.id) ?? [])`.
- [ ] **Step 4: Update the 5 component call sites** to pass active blockers from `useJobBlockers()`:
  - `Hitlist.tsx`: `const { activeByJob } = useJobBlockers();` → `buildHitlist(jobs, today, activeByJob)`; the per-row `deriveHealth(job)` → `deriveHealth(job, today, activeByJob.get(job.id) ?? [])`; `blockedCount` likewise.
  - `Schedule.tsx`, `KanbanBoard.tsx`, `JobDetail.tsx`: each `deriveHealth(job)` → pass `activeByJob.get(job.id) ?? []`.
  - `BlockerChip.tsx`: read `useJobBlockers()` + a contacts lookup (`useContacts()` — confirm the hook name) and, when `activeForJob(job.id)` is non-empty, render the `externalBlockerChip(active, contactName, now)` text + `blocked` tone (real, no demo tag); else today's behavior.
- [ ] **Step 5:** `npx tsc --noEmit` clean; test green; **run the existing Hitlist/health regression** (`npx tsx scripts/test-time-cards.ts` etc. unaffected; just confirm no suite breaks). Commit (`feat(jobs): external blockers drive derived health + Hitlist + chip (B2)`).

---

### Task 5: JobDetail "Blockers" card (list + add + resolve + history)

**Files:** Create `features/jobs/components/BlockersCard.tsx`; Modify `features/jobs/components/JobDetail.tsx` (render it near the status header / in OverviewTab — match where status lives).

- [ ] **Step 1: Build `BlockersCard({ jobId }: { jobId: string })`** (`"use client"`). Consumes `useJobBlockers()` (`activeForJob`, `addBlocker`, `resolveBlocker`, `reopenBlocker`, `blockers`) + `useContacts()` for the picker + name resolution + `useJob(jobId)` for the linked-contact ids (payerId/designerId/architectId/gcId/homeownerId to pin).
  - **Active list:** each active blocker → `reason` · party (via `partyLabel`) · aging badge `{blockerAgeDays}d` (token: `text-text-tertiary`, switch to `text-status-blocked` at ≥7d) · **Resolve** button. Gated-phase shown as a small `PHASE_LABELS[gatedPhaseId]` pill, or "whole job".
  - **Add form** (inline, revealed by an "+ Add blocker" button — mirror `AddCardModal`/inline patterns, NOT a native modal): `reason` text input (required); **waiting on** = a `<select>` of contacts (job-linked pinned at top with an `— linked —` optgroup, then all) with a final "Other (type a label)" option that reveals a text input → sets `waitingOnLabel`; **gates phase** `<select>` of the 6 `PHASE_ORDER` + a "Whole job" default (null). Submit → `addBlocker({ jobId, reason, waitingOnContactId, waitingOnLabel, gatedPhaseId })`. Validate reason non-empty.
  - **History:** a collapsible "Resolved (N)" section listing resolved blockers (party · `Resolved` · age-at-resolve) with a **Reopen** button.
  - Tokens only; card idiom `rounded-2xl bg-surface p-4 shadow-resting` (match JobDetail cards); touch targets ≥44px; `aria-label`s on icon buttons; inline confirm for Resolve is fine (low-stakes, has history/reopen).
- [ ] **Step 2: Render** `<BlockersCard jobId={job.id} />` in `JobDetail` (near the health/status header — read JobDetail to place it consistently; keep route pages thin, logic in the card).
- [ ] **Step 3:** tsc clean. Commit (`feat(jobs): JobDetail Blockers card — add/resolve/history (B2)`).

---

### Task 6: Soft milestone gate (phase-specific blockers)

**Files:** Modify `features/jobs/components/JobDetail.tsx` and `features/jobs/components/TasksTab.tsx` (the two `MilestonesStrip` / advance call sites).

- [ ] **Step 1:** In each place that calls `updateJob(job.id, { currentMilestone: stage })` from a milestone change, wrap the handler: compute `const gating = phaseGatingBlocker(activeForJob(job.id), stage);` (from `jobBlockers.ts` + `useJobBlockers`). If `gating`, set a local `pendingStage`/`gatingBlocker` state that renders an **inline confirm** ("⏳ {PHASE_LABELS[stage]} is externally blocked — waiting on {partyLabel(gating)}. Advance anyway?") with **Advance** + **Cancel**; Advance → `updateJob(...)` + clear; Cancel → clear. If no `gating`, call `updateJob` directly (unchanged). Whole-job blockers (`gatedPhaseId === null`) are NOT returned by `phaseGatingBlocker`, so they never gate. Tokens only; no `window.confirm`.
- [ ] **Step 2:** tsc clean. Commit (`feat(jobs): soft milestone gate on phase-specific blockers (B2)`).

---

### Task 7: Shop board read-only blocker chip

**Files:** Modify `features/shop/components/JobBoard.tsx` (phase columns + board header).

- [ ] **Step 1:** In `JobBoard`, read `useJobBlockers().activeForJob(jobId)`. For the selected job: render a read-only chip `⏳ externally blocked — waiting on {party} · {N}d` —
  - **phase-specific** blockers (`gatedPhaseId === phase`) → on that phase column's header (the `PHASE_ORDER.map` loop, line ~17).
  - **whole-job** blockers (`gatedPhaseId === null`) → under the job-name header (`<h2>`).
  Party text via `partyLabel` + a contacts lookup; aging via `blockerAgeDays`. Tone `text-status-blocked` on `bg-status-blocked-soft`, `rounded-full`, small. Read-only (no actions).
- [ ] **Step 2:** tsc clean. Commit (`feat(shop): read-only external-blocker chip on the work board (B2)`).

---

### Task 8: Briefing integration

**Files:** Modify `features/briefing/lib/prompt.ts`, `features/briefing/lib/generateBriefing.ts`.

**Interfaces:**
- `JobInput` gains `externalBlockers: { reason: string; party: string; days: number }[]`.
- `jobsToInput(jobs, today, blockersByJob?: Map<string, JobBlocker[]>, contactName?: (id: string) => string | undefined)` — populate `externalBlockers` from `blockersByJob.get(job.id) ?? []` (active only — the map already holds actives) using `partyLabel` + `blockerAgeDays`. Default `[]` when not supplied (backward-compatible).

- [ ] **Step 1:** Add the field + populate it in `jobsToInput`. In `generateBriefing.ts`, load active blockers + a contact-name lookup server-side (service-role read of `job_blockers where resolved_at is null` + `contacts`) and pass them in. (Read `generateBriefing.ts` first to match its data-loading idiom + the server Supabase client.)
- [ ] **Step 2:** Extend `SYSTEM_PROMPT` with a rule: *"A job with `externalBlockers` is high-priority (severity red): surface `{code}: externally blocked — waiting on {party} for {days}d ({reason})` and recommend chasing the party."* Keep the existing "skip healthy jobs" rule intact.
- [ ] **Step 3:** `npx tsc --noEmit` clean; `npm run briefing:test` runs without error (it exercises the generator). Commit (`feat(briefing): surface external blockers in the daily briefing (B2)`).

---

### Task 9: Full gate + authenticated browser smoke + docs

**Files:** Modify `features/jobs/CLAUDE.md` (+ `features/shop/CLAUDE.md` note); update `.superpowers/sdd/progress.md`.

- [ ] **Step 1: Full gate** — `npx tsc --noEmit` clean; `npm run lint` clean; all `tsx` suites green (`test-job-blocker-rowmap`, `test-job-blockers`, `test-health-with-blockers`); `npm run build` OK (`/`, `/shop`, `/jobs/[id]`, `/briefing` build).
- [ ] **Step 2: Docs** — `features/jobs/CLAUDE.md`: document the Blockers card + `job_blockers` table + derive-on-read health + the soft gate (link ADR 0013). One-line note in `features/shop/CLAUDE.md` (read-only chip).
- [ ] **Step 3: Authenticated browser smoke** (dev server on 3000; reset smoke user; seed a job if needed): add a blocker on a job → Hitlist sorts it to top + chip shows party/aging → open the gated phase's milestone advance → soft warn appears → Advance works → `/shop` shows the read-only chip on the gated column → Resolve → health clears + chip gone. Clean up seed rows. Screenshot.
- [ ] **Step 4: Commit** (`feat(jobs): external blockers (B2) — gate green + smoke + docs`).

---

## Self-Review

**Spec coverage:** table + RLS (T1) ✓; type + row mapper (T1) ✓; dual-mode store + activeByJob (T2) ✓; pure derivation + aging + party + chip + phase-gate (T3) ✓; derive-on-read health precedence `complete>paused>blocker>schedule` + Hitlist top + chip (T4) ✓; JobDetail add/resolve/history UI (T5) ✓; soft phase-gate, whole-job never gates (T6) ✓; shop read-only chip phase-vs-header (T7) ✓; briefing surfacing (T8) ✓; gate + smoke + docs (T9) ✓. **Deferred (per spec):** free-text migration, aging notifications, blocker editing, internal owner.

**Placeholder scan:** logic/data tasks (T1–T4, T8) carry complete code or exact signatures; UI tasks (T5–T7) give structure + exact store/derivation APIs + the existing components to mirror (`workCardsStore`, `AddCardModal`, JobDetail card idiom) — the proven Slice B style.

**Type consistency:** `JobBlocker` shape identical across T1/T2/T3; `activeBlockers?`/`activeByJob` arg names consistent T3→T4→T8; `gatedPhaseId: MilestoneStage | null` used consistently; `phaseGatingBlocker` (T3) consumed in T6; `externalBlockerChip` (T3) consumed in T4/T7.

**Verify-against-code (don't guess at build time):** the exact `useContacts` hook name + a contact-name lookup shape (T4/T5/T7); where `WorkCardsProvider` is mounted in `layout.tsx` (T2); the two milestone-advance call sites in `JobDetail`/`TasksTab` (T6); `generateBriefing.ts`'s server data-loading idiom + service-role client (T8); the JobDetail card placement for the Blockers card (T5).
