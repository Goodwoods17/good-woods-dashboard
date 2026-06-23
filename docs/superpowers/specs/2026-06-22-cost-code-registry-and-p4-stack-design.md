# Cost-code registry + Budget-vs-Actual (P4) — the stack (Design)

- **Date:** 2026-06-22 (grilled with Andrew via grill-with-docs)
- **Status:** DRAFT for review. Builds on **ADR 0012** (unified Job template, codes live
  in Labour) + **ADR 0008/0009/0010** (phases, budget-on-job, QuickBooks-ready).
- **Supersedes:** the monolithic "P4 Budget-vs-Actual" plan in
  `2026-06-20-cost-codes-job-costing-design.md` §6–8. The grill showed P4 is a
  **capstone**, not a single feature — it sits on a 4-part stack. The §6–8 math/views
  still stand; this doc re-sequences how we get there.
- **Glossary updated inline this session:** `docs/domain.md` — **Budget** (materials are
  a job-level fixed figure, not per-phase), **Cost code** (a live user-managed registry,
  phase required, feeds estimate→budget→P4→kanban), **Trade-line** (phase-tagged + carries
  cost *and* schedule dates; subtrade variance is per-phase).

## The stack (why P4 can't be built alone)

| # | Slice | Depends on | Why P4 needs it |
|---|---|---|---|
| **A** | **Live cost-code registry** | — | Codes Andrew adds must flow into estimates + P4 (today Slice 1 reads a hardcoded mirror) |
| **B** | **Shop-floor kanban + timer→actuals** | A | The **actuals feed** — per-code cards, timer logs job+code+qty. No actuals → nothing to compare |
| **C** | **Phase-tagged scheduled subtrades** | — | Toolpath-Cut / countertop variance is **per-phase**, and their dates land on P4's timeline |
| **D** | **P4 Budget-vs-Actual tab** | A,B,C | The capstone display — 5 views + margin/clawback |

Build order: **A → B → C → D**, each its own spec → plan → build. This doc fully specs
**Slice A**; B/C/D are scoped sketches, specced when reached.

---

## Slice A — Live cost-code registry  *(this slice)*

**Goal:** cost codes become live, user-managed data end to end. A code added in
`/labour → Setup → Cost codes` flows automatically into estimates, the frozen budget,
and (later) P4 — with no code change. Retro-corrects Slice 1's hardcoded
`CANONICAL_COST_CODES`.

### What already exists (confirmed in the grill)
- `labour_operations` carries `code`, `driver_unit`, `cabinet_type`, `default_minutes`,
  `category_id` (= phase). `useLabour()` exposes them; `LabourSetup` already has an
  **add** control + editable code/driver/cabinet-type/phase fields. **The "add a cost
  code" button Andrew asked for already ships.**
- Slice 1 seeded 12 canonical codes and built the estimator panel + budget + save — but
  it reads `CANONICAL_COST_CODES` (a TS constant), so user-added codes don't appear.

### Changes

1. **Estimator/budget/panel resolve from the live registry.**
   - `costCodes.ts`: `CANONICAL_COST_CODES` is demoted to **seed data only** (mirrors the
     seed migration; no longer the runtime source). Keep `PhaseId`, `PHASE_LABELS`,
     `PHASE_ORDER`, `rateForPhase` (phase→rate is fixed: design→designRate,
     install→installRate, else shopRate).
   - New helper builds a `CostCodeDef` map from `useLabour().operations` (those with a
     non-null `code`): `{ code, name, phaseId: categoryId, cabinetType, driver: driverUnit,
     defaultMinutes }`.
   - `budget.ts deriveCostCodeBudget` takes that **registry map** as a parameter instead
     of importing `CANONICAL_COST_CODES`. Same math. `derivePerRoomBudgets` unchanged
     (it delegates).
   - `CostCodesPanel` + `EstimatorView` pass the registry map through. The template's
     `costCodeSet` still references codes by **string key**; a set entry not in the
     registry is skipped (already the `findCostCode`→skip behaviour).

2. **Quantity resolution generalised** (no more hardcoded `DEL-LOAD` string special-case):
   - `cabinet_type` set (ASM-/INST-/FIT- per type) → qty = that cabinet count.
   - otherwise (driver set, no cabinet_type) → qty from a **named driver source**: the
     Mozaik import or a manual entry (FIN-SPRAY sqft, CUT-SHEET sheets, the component
     codes' counts). `DEL-LOAD` becomes "qty = total cabinet count" via an explicit,
     documented default rather than a magic string — or simply import/manual.

3. **Phase is required when adding a cost code** (`LabourSetup`): the add flow forces a
   phase choice (no silent default to the first category). Rationale: the phase is the
   code's home column on the shop-floor **kanban** (Slice B) — every code must have one.

4. **Seed the 4 component codes** (idempotent seed migration, same pattern as
   `20260622181200`): all driver = `ea`, mostly install/assembly:
   - `INST-INSERT` (Install insert/accessory — garbage/bottle pullout, tray), phase `install`
   - `INST-ROLLOUT` (Install rollout/tray), phase `install`
   - `HW-PULL` (Mount pulls/handles), phase `install`
   - `FIT-DOOR` (Fit/hang doors + fronts), phase `finishing`
   These are **starters** — Andrew extends the set from `/labour`.

5. **Wire the Mozaik counts to the component codes** (the import already captures them;
   they currently land nowhere):
   - `# inserts` → `INST-INSERT` · `# rollout shelves` + `# tray boxes` → `INST-ROLLOUT`
     · `# pulls` → `HW-PULL` · `# base doors` + `# wall doors` + `# drawer fronts` →
     `FIT-DOOR`.
   - Add a **`# Inserts`** metric to the parser + target CSV (inserts arrive as BOM lines
     today; a clean count is better than summing fuzzy BOM names).
   - `mozaikToEstimateDraft.qtyByCode` gains these mappings; they flow into the budget
     exactly like FIN-SPRAY/CUT-SHEET do now.

### Non-changes
Material BOM matching, per-room split, the save path, the seeded 12 codes — all stay.
The template `costCodeSet` literals stay (stable string contract).

### Verification
- `tsc`/`lint`/`build`; the 3 existing tsx suites stay green (budget derivation updated to
  take a registry map — test passes a stub map).
- New: add a cost code in `/labour` (browser) → it appears in the estimator panel → set a
  count → it budgets → Save-as-Job writes a `job_cost_budgets` row for it.
- Mozaik fixture import → assert the component codes (`INST-INSERT` etc.) get non-zero qty.

---

## Slice B — Shop-floor kanban + timer→actuals  *(sketch)*

Each cost code → a task **card** in its phase column on a job's shop-floor board; a worker
starts the **pace timer** from the card (job + code + target qty pre-filled); Stop logs a
`labour_session` tagged `job_id` + `operation_id` (+ `quantity`). That session stream **is**
P4's labour actuals. Folds into the existing shop-floor-timers draft spec
(`2026-06-22-shopfloor-timers-timecards-design.md`). Specced when reached.

## Slice C — Phase-tagged scheduled subtrades  *(sketch)*

`job_trades` gains `phase_id` + schedule dates (e.g. a countertop's **template date** +
**install date**) + uses its `cost`. A trade-line is added per phase (Toolpath cut →
CNC/Cut; countertop → Install) and its dates feed the **project schedule / P4 timeline**,
its `cost` the **subtrade budget for that phase** (actual = matching `job_cost_actuals`
subtrade). Realises ADR 0007 §9's future tie-in; likely an ADR amendment (trade-line gains
phase + schedule). Specced when reached.

## Slice D — P4 Budget-vs-Actual tab  *(sketch — math/views already designed §6–8)*

The capstone on `/jobs/[id]`. Reads the live budget (A), labour actuals (B), subtrade
budget+actual per phase (C), and the job-level material figure. Decisions locked in the
grill:
- **Labour:** per-phase + per-code variance. Actual labour-$ uses each budget row's
  **snapshot rate** (so variance is time/qty, never a rate mismatch — also resolves the
  Delivery-rate question; `DEL-LOAD` = shopRate per-code is precise).
- **Materials:** job-level fixed figure vs Σ `job_cost_actuals(material)`.
- **Subtrades:** **per-phase** (from C) — `job_trades.cost` vs subtrade cost-actual.
- **Rooms:** per-room budget shown as a **reference panel**; variance computed at phase
  level (per-room variance deferred until B tags room).
- **Views:** all 5 (Timeline E default, Burn-up A, Projection D, Phase bars B, Pace+margin
  C) + always-visible projected-margin / clawback header.
- **Projection:** §8 math; quantity-aware for driven codes (the timer captures qty).

## Open items (later slices)
- Slice B: the 8 shop-floor decisions in the draft spec; does room get tagged on the
  session here (→ unlocks per-room variance)?
- Slice C: trade-line schedule shape (which dates per trade type); the "add from a
  countertop subtrade" UI; ADR amendment for ADR 0007.
- Slice A detail to confirm in review: the `DEL-LOAD` qty default, and adding `# Inserts`
  to the co-designed Mozaik CSV.
