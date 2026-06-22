# Cost Codes & Live Job Costing — Plan P0: Milestone Realignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realign the job's `MilestoneStage` from `sold·materials·cut·assemble·finish·install` to the six cost **phases** (`design·cnc·assembly·finishing·delivery·install`), so a job's current milestone doubles as the phase-complete signal the costing feature needs (ADR 0008).

**Architecture:** Change one enum + its label/hint lists in `shared/lib/types.ts`, let the TypeScript compiler surface every call site, fix the seeds and the briefing fixture, then a one-statement SQL migration backfills `jobs.current_milestone`. No new tables, no behavior beyond the renamed/added stages.

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript (strict) · Supabase (Postgres, migrations via the Supabase MCP) · Tailwind. No unit-test runner — see Global Constraints for the verification gate.

## Global Constraints

- **This is Plan P0 of 7** (P0–P6 in `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md` §10). Each phase is its own plan; later plans are written as their predecessor lands. This plan covers **P0 only**.
- **Spec & decisions:** `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md`; ADR `docs/decisions/0008-milestones-realign-to-phases.md`. Read both before starting.
- **Verification gate (no Jest/Vitest in this repo):** every task ends green on `npx tsc --noEmit` **and** `npm run lint` **and** `npm run build`. Behavior is verified with a Playwright MCP browser smoke (auth via the `claude-smoke-test@spacecraftjoinery.local` user — reset its password per session via the Supabase admin API). Pure-logic checks use a `tsx` assert script (the pattern `npm run briefing:test` uses).
- **Canonical term is "Phase"** (not "category"/"section") in all copy and new code. The `labour_categories` table keeps its name; the word is "phase".
- **New milestone values must exactly equal the `labour_categories` ids** (`design·cnc·assembly·finishing·delivery·install`) so `currentMilestone` compares 1:1 to a phase.
- **Money** formats with `formatCAD` from `@shared/lib/format`. **Imports** use `@/`, `@features/*`, `@shared/*` aliases. **Migrations** are timestamp-prefixed SQL in `supabase/migrations/`, applied through the Supabase MCP. **Never** force-push / `git reset --hard` / `rm`.
- Work on the current branch; **commit per task** with conventional-commit messages ending `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure (P0)

- `shared/lib/types.ts` — `MilestoneStage` union + `MILESTONE_STAGES` list (the single source of truth for the enum).
- `features/jobs/components/TasksTab.tsx` — `STAGE_HINTS: Record<MilestoneStage,string>` (per-stage completion hint copy).
- `features/jobs/components/MilestonesStrip.tsx` — renders `MILESTONE_STAGES` generically; verify only (no value literals).
- `features/jobs/lib/jobs.ts` — `SEED_JOBS` `currentMilestone` literals.
- `features/estimator/lib/createJobFromEstimate.ts` — initial `currentMilestone` on a new job.
- `src/app/jobs/new/page.tsx` — initial `currentMilestone` on manual job creation.
- `features/briefing/lib/prompt.ts` — a fixture/example string referencing a milestone (copy only).
- `features/installer/components/InstallerView.tsx` — uses `currentMilestone: "install"` (still valid; verify only).
- `supabase/migrations/20260620030000_milestones_realign_to_phases.sql` — **Create**: the value backfill.

> The compiler is the worklist: after Task 1's edit, `npx tsc --noEmit` enumerates every seed/literal that still uses an old value. Task 1 fixes them all so the build returns green before committing.

---

## Task 1: Realign the `MilestoneStage` enum and every call site

**Files:**
- Modify: `shared/lib/types.ts:17-32`
- Modify: `features/jobs/components/TasksTab.tsx` (the `STAGE_HINTS` object)
- Modify: `features/jobs/lib/jobs.ts` (each `currentMilestone:` literal)
- Modify: `features/estimator/lib/createJobFromEstimate.ts:173`
- Modify: `src/app/jobs/new/page.tsx:245`
- Modify: `features/briefing/lib/prompt.ts:141` (example copy)

**Interfaces:**
- Produces: `type MilestoneStage = "design" | "cnc" | "assembly" | "finishing" | "delivery" | "install"` and `MILESTONE_STAGES: { key: MilestoneStage; label: string }[]` in the same order. Every later task and every consumer relies on these exact six string values.

- [ ] **Step 1: Replace the enum + stages list in `shared/lib/types.ts`**

```ts
export type MilestoneStage =
  | "design"
  | "cnc"
  | "assembly"
  | "finishing"
  | "delivery"
  | "install";

export const MILESTONE_STAGES: { key: MilestoneStage; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "cnc", label: "CNC / Cut" },
  { key: "assembly", label: "Assembly" },
  { key: "finishing", label: "Finishing" },
  { key: "delivery", label: "Delivery" },
  { key: "install", label: "Install" },
];
```

- [ ] **Step 2: Run the compiler to get the worklist**

Run: `npx tsc --noEmit`
Expected: FAILs with errors on each stale literal — the `STAGE_HINTS` object in `TasksTab.tsx` (missing/extra keys), and `currentMilestone` literals in `jobs.ts`, `createJobFromEstimate.ts`, `jobs/new/page.tsx`. This list is your remaining edits.

- [ ] **Step 3: Rewrite `STAGE_HINTS` in `features/jobs/components/TasksTab.tsx`** with the new keys and completion-definition copy (from ADR 0008):

```ts
const STAGE_HINTS: Record<MilestoneStage, string> = {
  design: "Client sign-off on approved shop drawings, contract & estimate",
  cnc: "Sheet goods cut, parts machined",
  assembly: "Boxes assembled",
  finishing: "Finish complete",
  delivery: "All parts delivered to site",
  install: "Installed on site",
};
```

- [ ] **Step 4: Remap the seed `currentMilestone` literals** using the ADR 0008 backfill map (`sold→design`, `materials→cnc`, `cut→cnc`, `assemble→assembly`, `finish→finishing`, `install→install`):
  - `features/jobs/lib/jobs.ts`: `"cut"→"cnc"` (line ~13), `"sold"→"design"` (~46), `"finish"→"finishing"` (~77), `"install"` stays (~107), `"materials"→"cnc"` (~137), `"install"` stays (~166).
  - `features/estimator/lib/createJobFromEstimate.ts:173`: `currentMilestone: "sold"` → `currentMilestone: "design"`.
  - `src/app/jobs/new/page.tsx:245`: `currentMilestone: "sold"` → `currentMilestone: "design"`.

- [ ] **Step 5: Update the briefing fixture copy** in `features/briefing/lib/prompt.ts:141` so the example reads with a valid stage, e.g. change `"...but currentMilestone is cut; 4 milestones still to clear."` to `"...but currentMilestone is assembly; 3 milestones still to clear."` (copy only — no logic change; `currentMilestone` elsewhere in this file is a passthrough string and needs no edit).

- [ ] **Step 6: Run the full gate**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three PASS (no type errors, no lint errors, build succeeds).

- [ ] **Step 7: Commit**

```bash
git add shared/lib/types.ts features/jobs/components/TasksTab.tsx features/jobs/lib/jobs.ts features/estimator/lib/createJobFromEstimate.ts src/app/jobs/new/page.tsx features/briefing/lib/prompt.ts
git commit -m "refactor(jobs): realign MilestoneStage to the 6 phases (ADR 0008)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backfill `jobs.current_milestone` (data migration)

**Files:**
- Create: `supabase/migrations/20260620030000_milestones_realign_to_phases.sql`

**Interfaces:**
- Consumes: the new milestone values from Task 1.
- Produces: every existing `jobs.current_milestone` row holds one of the six new values.

- [ ] **Step 1: Write the migration**

```sql
-- ADR 0008: job milestones realign to the six phases.
-- jobs.current_milestone is plain `text` (0001_jobs.sql) with no CHECK/enum to alter.
update jobs
set current_milestone = case current_milestone
  when 'sold'      then 'design'
  when 'materials' then 'cnc'
  when 'cut'       then 'cnc'
  when 'assemble'  then 'assembly'
  when 'finish'    then 'finishing'
  else current_milestone   -- 'install' unchanged; 'delivery' is new (no legacy rows map to it)
end;
```

- [ ] **Step 2: Confirm no stale values remain (defensive)** — extend the migration with a guard that surfaces anything unmapped instead of silently leaving it:

```sql
do $$
declare bad int;
begin
  select count(*) into bad from jobs
  where current_milestone not in ('design','cnc','assembly','finishing','delivery','install');
  if bad > 0 then
    raise exception 'milestone backfill left % row(s) with an unmapped value', bad;
  end if;
end $$;
```

- [ ] **Step 3: Apply via the Supabase MCP**

Use the Supabase MCP `apply_migration` tool with this file. Expected: success, no exception raised.

- [ ] **Step 4: Verify the data**

Use the Supabase MCP `execute_sql`:
`select current_milestone, count(*) from jobs group by 1 order by 1;`
Expected: only the six new values appear; no `sold`/`materials`/`cut`/`assemble`/`finish`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260620030000_milestones_realign_to_phases.sql
git commit -m "migrate(jobs): backfill current_milestone to the 6 phases (ADR 0008)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Browser smoke — milestones render and advance

**Files:** none (verification only).

**Interfaces:**
- Consumes: a running dev server and an authenticated session.

- [ ] **Step 1: Start the dev server**

Run `npm run dev` via the Monitor tool (per `CLAUDE.md`, so runtime errors stream live). Confirm it serves on `127.0.0.1:3000` (or the configured port).

- [ ] **Step 2: Authenticate the smoke user**

Reset the `claude-smoke-test@spacecraftjoinery.local` password via the Supabase admin API for this session (see memory `claude-smoke-test-user`), then log in through the Playwright MCP browser.

- [ ] **Step 3: Open a job and check the milestone strip**

Navigate to a job at `/jobs/[id]`. Take a `browser_snapshot`.
Expected: `MilestonesStrip` shows **Design · CNC / Cut · Assembly · Finishing · Delivery · Install** in order; the active stage matches the job's `current_milestone`.

- [ ] **Step 4: Check the Tasks tab hints and advance**

Open the **Tasks** tab. Expected: each stage shows its new hint (e.g. Design → "Client sign-off on approved shop drawings, contract & estimate"). Click to advance one stage; confirm it persists (reload, still advanced) and an activity entry "Milestone advanced to …" appears.

- [ ] **Step 5: Confirm the console is clean**

Use `browser_console_messages`. Expected: no React/runtime errors related to milestones.

- [ ] **Step 6: Record the result** in the PLAN's status note (below) — pass/fail with any screenshot path.

---

## Status

- [x] **Task 1 — code** (enum, hints, seeds, briefing fixture): done, gate green (tsc ✓ lint ✓ build ✓), committed `792d328`.
- [x] **Task 2 — migration file** written + committed `3fbc69f`. **NOT applied** to the shared Supabase project (deliberate — the new enum breaks builds still on the old values; apply must be coordinated with deploy or run on a Supabase dev branch).
- [ ] **Task 2 apply + Task 3 browser smoke** — deferred to a session with Andrew, because applying the backfill to the shared prod DB would break the milestone strip on `main` / `feat/partners` / the live app until they also deploy this enum. Decide: (a) apply + deploy together, or (b) spin a Supabase dev branch and smoke there.

---

## Self-Review (done at authoring)

- **Spec coverage:** P0 implements spec §10 P0 + ADR 0008 in full (enum, label/hint copy, all seeds, the `Job.invoice` migration is *not* here — it belongs to P1, correctly scoped out). ✓
- **No placeholders:** every code/SQL step shows the actual content; verification commands are real for this repo (no Jest). ✓
- **Type consistency:** the six values (`design·cnc·assembly·finishing·delivery·install`) are used identically in the enum, `MILESTONE_STAGES`, `STAGE_HINTS`, the seeds, and the migration's `case`/guard. ✓

## Next plans (not in scope here)

P1 schema & types → P2 cost-code registry + driver + templates in `/labour` → P3 estimator labour-codes panel → P4 Job Budget-vs-Actual tab (views E/B/C) → P5 remaining views + `/pnl` rollup → P6 learning loop. Each gets its own `docs/superpowers/plans/` file when P0 lands. See spec §10.
