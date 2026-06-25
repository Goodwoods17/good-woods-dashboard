# Good Woods Dashboard — Roadmap

> **Living document.** Verified against the actual `main` branch + codebase, not design docs
> (the design docs drift — e.g. Mozaik import and P3 shipped while specs still read "planned").
> **Maintain it:** whenever a slice ships, a PR merges, or scope changes during a session,
> update this file in the same session. Verify claims against code/git, not memory.
>
> **Last verified:** 2026-06-23 (against `main` @ #18 — PRs #9, #14, #17, #18 all merged; 0 open PRs).

---

## Where we are (one line)

All ~17 app surfaces are **built and live**. The full **job-costing / Budget-vs-Actual spine
(cost-codes A–D)** has shipped, plus **CI + a security-hardening pass** (below). Remaining spine
work is **P5 → P6**. The active build frontier is now the **per-feature Phase-2 backlog** (§4) —
first up: **Reface forms/hinge** (in flight).

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
  Subtrade toggle on "Log actual cost" form. `npm test` (Vitest) covers the math. (PR #17)
- **P2b** cost-code task-template CRUD (`/labour` Templates tab) — (PR #9)

### Infra / hardening ✅

- **CI** — GitHub Actions (`.github/workflows/ci.yml`) runs tsc → lint → Vitest → build on every
  PR to `main` and push to `main`. The repo's first automated gate. (PR #18)
- **CI E2E browser smoke** ✅ — a second `e2e` job boots a **local Supabase** (Auth + RLS) via the
  CLI, replays all migrations from zero, seeds a smoke user (admin API), builds against it, and runs
  an **authed Playwright smoke** (login → reach the authed dashboard) headless, off prod data.
  Catches the interactive bug class tsc/lint/jsdom can't see. The from-zero replay also fixed a
  migration-version-drift collision (6 files renamed to unique timestamps). Phase 1 of the
  **autonomous build workflow** (ADR 0018). (PR #28) · Follow-ons in this milestone: render-seeded-
  data assertion · React Compiler + `react-hooks/unsupported-syntax` lint · pgTAP RLS tests.
- **Security** — pinned `search_path = ''` on the 5 advisor-flagged functions
  (`function_search_path_mutable` finding closed). (PR #18) · Known/intentional leftovers: the
  `authenticated`-all RLS policies (single-tenant model) and the leaked-password-protection auth
  toggle (off) — both WARN-level, out of scope.

### Remaining 🗂️ (build order)

```
🗂️ P5      remaining P4 views + /pnl open-jobs rollup ...... not built
🗂️ P6      learning loop (actuals → estimator task-template defaults) ... not built
```

**Spec:** `docs/superpowers/specs/2026-06-22-cost-code-registry-and-p4-stack-design.md` (§5 Slice C, §6–8 P4 math).

---

## 2b. Job Drawings & Markup — shipped frontier 🆕

PDF/image drawings per job, with piece tracking + live status. Spec:
`docs/superpowers/specs/2026-06-23-job-drawings-markup-design.md`; ADR 0016.

### Shipped ✅ (2026-06-23 → 24, PRs #20/#21/#22 merged to main)
- **Slice 0** storage + viewer — `job-documents` bucket (auth-gated), `documents` upload
  columns, `/jobs/[id]/drawings` route + shared `<DrawingsButton/>` (job/shop/installer),
  pdf.js + image render, Overview link-out. Also hardened legacy `reface-photos` RLS.
- **Slice 1** pieces + pins + status — `job_pieces` table + dual-mode `piecesStore`,
  `pipelines.ts` (`not_started → stages → done`), add-pin mode + `react-zoom-pan-pinch`
  gestures, grouped checklist (advance/stepper/two-step delete), forced cut-method prompt.
- **Slice 2** realtime — `postgres_changes` subscription; piece changes sync < ~1s, no refresh.
- **Slice 3** ink markup — `document_annotations` table + dual-mode `annotationsStore`
  (load-on-open), `perfect-freehand` strokes in an SVG overlay, `activeTool` toolbar
  (pan/pin/pen/highlighter/eraser) + color swatches, tap-to-erase, session-scoped
  undo/redo (⌘Z/⇧⌘Z), lifted PDF page state so ink **and** pins filter per `(document, page)`.
  PR (review). Authed browser smoke green: pen/highlighter/erase/undo/redo/per-page/reload.
- **Slice 4** shapes + text — widened `Annotation.data` union (`StrokeData|ShapeData|TextData`),
  `shapes.ts` geometry (TDD), `InkLayer`→`MarkupLayer` rendering all four types. Toolbar gains
  **shape** (arrow/rect/line), **text**, **select** tools. Select = tap to pick, drag to move,
  corner handles to resize (shapes + text); double-tap text to edit; Delete key / Trash removes.
  Plain colored text with a white halo (legible, never boxes the drawing). `updateAnnotation` +
  history `update` entry (move/resize/edit are undoable). Stacked PR on Slice 3 (review). Authed
  smoke green: arrow/rect/line draw, text place+halo, move, resize, edit, erase, undo, per-page, reload.
- **Slice 5** sketchpad — blank-canvas sketches as `documents` with `source='sketch'` (page 0,
  no migration — Slice 0 seam), reusing the whole markup engine. `SketchCanvas` = 4:3 white surface
  + a toggleable **dot grid**; "New sketch" creates a named sketch (`Sketch N`) listed beside drawings.
  Stacked PR on Slice 4 (review). Authed smoke green: create, draw ink+shape+text, dots on/off,
  reopen + reload persist.

### Remaining 🗂️ (build order)
```
🗂️ later     Mozaik CSV seeding + pin-an-existing-piece ................. not built
```

---

## 3. Open PRs

**None.** **CI E2E browser smoke shipped** (#28 — autonomous-workflow Phase 1, ADR 0018).
**Drawings Slices 3–5 are all merged to `main`** (#24 ink, #27 shapes/text, #26 sketchpad —
verified green, branches pruned). The cost-codes stack (Slices A–D + P2b), the catalog attributes
editor (#14), the CI/security pass (#18), and **Drawings Slices 0–2 (#20/#21/#22)** are also on `main`.
With 3–5 landed, the Drawings spec's slice list (0–5) is complete; only the later **Mozaik CSV
seeding** remains.

**In flight:** `feat/reface-forms` (`gw-reface` worktree) — Reface end-panel/toe-kick forms +
hinge-boring logic, in design.

---

## 4. Per-feature Phase-2 backlog (independent — good parallel-session candidates)

Mostly **disjoint feature folders** → safe to build in parallel windows (see
`parallel-dev-playbook` in memory).

- **Estimator:** draft-estimate persistence · custom templates → Supabase · catalog pick-from · PDF quote export
- **Inventory:** **stock-vs-job-needs (BOM)** — now _unblocked_ (Mozaik import shipped the per-job BOM input)
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
derived source-of-truth · **0014** BvA P4 scope + margin · **0015** subtrade actuals per
trade-line (Slice C, supersedes 0014 subtrade deferral) · **0016** active drawings in Supabase /
archive to Drive · **0017** trunk-based vertical slices, no stacked PRs · **0018** autonomous
build workflow (plan-first, run-till-done; global but fenced to software work). (0002/0003 = the
build process: deliberate-plan-then-autonomous-build.)

---

## How to maintain this file

1. Update it **in-session** whenever a slice ships, a PR merges/closes, or scope changes.
2. **Verify against code/git** (`git log main`, `gh pr list`, grep for the component) — never
   trust a design doc's status field; they drift.
3. Move shipped items from "Remaining" → "Shipped"; update the **Last verified** date.
4. This is the single source of truth for "what's done vs left" — the per-feature `PLAN.md`s and
   spec docs are detail, not status.
