# Good Woods Dashboard — Roadmap

> **Living document.** Verified against the actual `main` branch + codebase, not design docs
> (the design docs drift — e.g. Mozaik import and P3 shipped while specs still read "planned").
> **Maintain it:** whenever a slice ships, a PR merges, or scope changes during a session,
> update this file in the same session. Verify claims against code/git, not memory.
>
> **Last verified:** 2026-06-23 (against `main` @ PR #13; PR #14 catalog-attributes open; `feat/budget-vs-actual` in flight).

---

## Where we are (one line)

All ~17 app surfaces are **built and live**. The active frontier is the **job-costing /
Budget-vs-Actual spine** — most of it has shipped; the remaining work is **Slice C → Slice D
(the P4 tab) → P5 → P6**, plus merging PR #9.

---

## 1. App surfaces — shipped & live ✅

Jobs/Pipeline · Estimator (10-section quote + rooms + templates + Mozaik CSV import) · Shop
floor (6-phase work cards + pace timer) · Labour (timers + bottlenecks + time cards + cost-code
registry) · Catalog (materials + multi-supplier offers) · Partners (suppliers + subtrades + job
trades) · Reface Studio · Briefing (daily AI) · Installer · Calendar · Reports · P&L · Settings ·
Contacts/CRM · Projects (archive) · Auth (login; multi-role deferred).

**Stubs (intentionally minimal):** SOPs (read-only list, no DB/edit) · Documents (folder only,
undesigned).

---

## 2. Job-costing / Budget-vs-Actual spine — the live frontier

The deep work: a dependency chain ending in the **Budget-vs-Actual tab (P4)**, the capstone that
shows real margin per job from captured budget + timer actuals.

### Shipped ✅
- **P0** milestones realigned to the 6 phases (design·cnc·assembly·finishing·delivery·install)
- **P1** cost-codes schema + types (6 tables, RLS) · **P2a** labour cost-code/driver fields + qty capture
- **Slice 1** unified Job template + **Mozaik CSV import** (`MozaikImportModal` + `mozaikImport.ts`)
- **Slice A** live cost-code registry (codes are user-managed data end-to-end)
- **P3** estimator cost-code budget panel (`CostCodesPanel`) + Save-as-Job writes `job_cost_budgets`
  (`deriveCostCodeBudget` → `saveJobBudget`); folded into Slices 1 + A
- **Slice B1** shop-floor capture (cards → pace timer → `labour_session` actuals)
- **Slice B2** daily time cards (per-employee/per-project, edit, CSV)
- **External blockers** (ADR 0013) — structured `job_blockers` drive derived health, soft phase
  gate, shop chips, briefing (PR #13)

### Remaining 🗂️ (build order)
```
🟡 PR #9   P2b task-template CRUD (/labour Templates tab) ... BUILT, just MERGE it
🗂️ Slice C subtrades gain phase_id + schedule dates ........ not built (small; ADR 0007 §9 tie-in)
🗂️ Slice D ★ BUDGET-VS-ACTUAL TAB on /jobs/[id] ........... not built — THE capstone
              (math specced: 5 views + margin/clawback header; reads budget(1) + labour
               actuals(B) + subtrade cost/phase(C) + job-level material; no Budget tab exists
               on JobDetail yet — tabs are overview·tasks·files·costs·activity)
🗂️ P5      remaining P4 views + /pnl open-jobs rollup ...... not built
🗂️ P6      learning loop (actuals → estimator task-template defaults) ... not built
```
**Spec:** `docs/superpowers/specs/2026-06-22-cost-code-registry-and-p4-stack-design.md` (§5 Slice C, §6–8 P4 math).

---

## 3. Open PRs

| PR | What | Status / action |
|----|------|-----------------|
| **#9** | P2b cost-code **task-template CRUD** (`/labour` Templates tab) | Built, gate-green — **merge it** (the `/labour` surface it touches is now settled) |
| **#14** | Catalog **generic attributes editor + empty-category state** | Built + opus-reviewed READY + browser-smoked (seed mode). Isolated to `features/catalog`, no migration. Awaiting test/merge. |

(PR #3 estimator-Mozaik = CLOSED. No other open feature PRs.)

**In flight (uncommitted/unmerged branches):** `feat/budget-vs-actual` (the P4 capstone, another session) · `feat/catalog-surface-kinds` (= PR #14).

---

## 4. Per-feature Phase-2 backlog (independent — good parallel-session candidates)

Mostly **disjoint feature folders** → safe to build in parallel windows (see
`parallel-dev-playbook` in memory).

- **Estimator:** draft-estimate persistence · custom templates → Supabase · catalog pick-from · PDF quote export
- **Inventory:** **stock-vs-job-needs (BOM)** — now *unblocked* (Mozaik import shipped the per-job BOM input)
- **Labour:** labour-$ per job (× rates) · per-worker throughput · install/loading nudges
- **Shop:** Supabase realtime/persistence for the wall tablet (currently in-memory)
- **Catalog:** ~~surface all kinds~~ DONE (category-based UI already surfaces all 7 kinds; generic per-item attributes editor + empty-category state = PR #14) · remaining: estimator pick-from integration
- **Reface:** end-panel/toe-kick forms · hinge logic · order reconciliation
- **SOPs:** make editable (DB + versioning) · **Documents:** design from scratch
- **Cross-cutting:** QuickBooks two-way sync · multi-role auth · contacts comms-history

---

## 5. Longer-term ideas (someday / parked)

Carried over from the original prototype roadmap — revisit when the costing spine is complete:

- Print-friendly **cut / drill sheets** + **cut-list generator** from the schedule
- **Hinge boring coordinate output** (Reface hinge logic, above, is the first step)
- **Material order list** from active projects (overlaps Inventory BOM, §4)
- **Google Sheets sync** for door schedules
- **Client-facing read-only view** (for designers / clients like Raubyn)

---

## 6. Architecture decisions (locked)

ADRs `docs/decisions/`: **0008** milestones=phases · **0009** budget-on-job · **0010**
QuickBooks-ready costing · **0012** unified template + Mozaik · **0013** external blockers as
derived source-of-truth. (0002/0003 = the build process: deliberate-plan-then-autonomous-build.)

---

## How to maintain this file

1. Update it **in-session** whenever a slice ships, a PR merges/closes, or scope changes.
2. **Verify against code/git** (`git log main`, `gh pr list`, grep for the component) — never
   trust a design doc's status field; they drift.
3. Move shipped items from "Remaining" → "Shipped"; update the **Last verified** date.
4. This is the single source of truth for "what's done vs left" — the per-feature `PLAN.md`s and
   spec docs are detail, not status.
