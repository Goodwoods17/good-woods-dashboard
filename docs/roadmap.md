# Good Woods Dashboard — Roadmap

> **Living document.** Verified against the actual `main` branch + codebase, not design docs
> (the design docs drift — e.g. Mozaik import and P3 shipped while specs still read "planned").
> **Maintain it:** whenever a slice ships, a PR merges, or scope changes during a session,
> update this file in the same session. Verify claims against code/git, not memory.
>
> **Last verified:** 2026-06-23 (against `feat/subtrade-actuals` — Slice C complete).

---

## Where we are (one line)

All ~17 app surfaces are **built and live**. The active frontier is the **job-costing /
Budget-vs-Actual spine** — the full cost-codes stack (A–D) has shipped; the remaining work
is **P5 → P6**, plus merging PR #9.

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
- **Slice D** ★ **Budget-vs-Actual tab** on `/jobs/[id]` — labour + materials (ADR 0014). Five
  views: Timeline, Phase bars, Pace+margin. Margin/Clawback header anchored to quoted margin.
  Smoke fixture + Vitest math tests.
- **Slice C** subtrade actuals per trade-line — no migration (ADR 0015). Per-line projection,
  done-lock, Unassigned bucket. All-in projected margin (caveat label removed). Material |
  Subtrade toggle on "Log actual cost" form. `npm test` (Vitest) covers the math.

### Remaining 🗂️ (build order)
```
🟡 PR #9   P2b task-template CRUD (/labour Templates tab) ... BUILT, just MERGE it
🗂️ P5      remaining P4 views + /pnl open-jobs rollup ...... not built
🗂️ P6      learning loop (actuals → estimator task-template defaults) ... not built
```
**Spec:** `docs/superpowers/specs/2026-06-22-cost-code-registry-and-p4-stack-design.md` (§5 Slice C, §6–8 P4 math).

---

## 3. Open PRs

| PR | What | Status / action |
|----|------|-----------------|
| **#9** | P2b cost-code **task-template CRUD** (`/labour` Templates tab) | Built, gate-green — **merge it** (the `/labour` surface it touches is now settled) |

(PR #3 estimator-Mozaik = CLOSED. No other open feature PRs.)

---

## 4. Per-feature Phase-2 backlog (independent — good parallel-session candidates)

Mostly **disjoint feature folders** → safe to build in parallel windows (see
`parallel-dev-playbook` in memory).

- **Estimator:** draft-estimate persistence · custom templates → Supabase · catalog pick-from · PDF quote export
- **Inventory:** **stock-vs-job-needs (BOM)** — now *unblocked* (Mozaik import shipped the per-job BOM input)
- **Labour:** labour-$ per job (× rates) · per-worker throughput · install/loading nudges
- **Shop:** Supabase realtime/persistence for the wall tablet (currently in-memory)
- **Catalog:** surface hardware/insert/labour/service kinds in the UI · estimator pick-from integration
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
derived source-of-truth · **0014** BvA P4 scope + margin · **0015** subtrade actuals per
trade-line (Slice C, supersedes 0014 subtrade deferral). (0002/0003 = the build process:
deliberate-plan-then-autonomous-build.)

---

## How to maintain this file

1. Update it **in-session** whenever a slice ships, a PR merges/closes, or scope changes.
2. **Verify against code/git** (`git log main`, `gh pr list`, grep for the component) — never
   trust a design doc's status field; they drift.
3. Move shipped items from "Remaining" → "Shipped"; update the **Last verified** date.
4. This is the single source of truth for "what's done vs left" — the per-feature `PLAN.md`s and
   spec docs are detail, not status.
