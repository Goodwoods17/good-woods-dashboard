# Job Templates + Mozaik Import → Cost-Code Budget (Design Plan)

- **Date:** 2026-06-22 (grilled with Andrew; he's reviewing from the field)
- **Status:** DRAFT for review. Decisions locked in **ADR 0012**; glossary in `docs/domain.md` (Job template, Mozaik import).
- **Supersedes scope of:** P2b (standalone cost-code task templates, PR #9 — will be reworked, not merged as-is).
- **Companion specs:** cost-codes job-costing (`2026-06-20-cost-codes-job-costing-design.md`), shop-floor timers (`2026-06-22-shopfloor-timers-timecards-design.md`).

## 1. The funnel (what we're building toward)

```
Job template ("Full kitchen" = sections + cost-code set + defaults)
   → pick on a new estimate
   → fill quantities:  MANUAL cabinet counts  OR  drop a MOZAIK CSV
   → app RE-PRICES (catalog + labour rates + cost codes)   ← app owns the $
   → review/adjust the draft estimate
   → Save as Job → freezes the labour BUDGET (job_cost_budgets)
   → (later) cards + timers produce ACTUALS → budget-vs-actual
```

Cost code is the thread; the template defines the set, the job supplies the counts, the app prices it.

## 2. Decisions (from ADR 0012)
1. **One unified Job template** — fold estimator section-templates + the job `template` field + P2b task templates into one. It references cost codes; codes stay in Labour (ADR 0006).
2. **Template = task set, not fixed quantities.**
3. **Mozaik = quantities + structure only; the app re-prices.** Mozaik's $ are never the budget.
4. **Mozaik lands as a draft estimate to review**, then Save-as-Job freezes the budget.
5. **Sequencing: Slice 1 (template + manual) first, then Slice 2 (Mozaik).**

---

## Slice 1 — Unified Job template + manual quantities + cost-code budget

**Goal:** the template → estimate → frozen budget loop, with cabinet counts typed by hand. No Mozaik yet.

- **Data model:** extend the estimator's `EstimateTemplate` (today: `activeSections`, overhead/markup) with a **cost-code set** — `{ codeId, defaultQty, budgetedMinutes? }[]`. Built-ins seeded ("Full custom build", "Install only", "Refacing", "Sub finishing", "Design only"); custom templates user-creatable. Reuse/retire P2b's `cost_code_templates` table here (it already has the item shape — repurpose it as the cost-code side of the unified template, linked to the estimate template).
- **Estimator UI:** the existing template picker also loads the cost-code set into the **"Labour cost codes" panel** (job-costing P3, §5 of the costing spec) — codes grouped by phase, budgeted minutes pre-filled from each code's **historical average** (the `suggestedMinutes` we built in `pace.ts`), qty defaulting from the cabinet summary (`ASM-BASE ×4` from "4 base").
- **Re-pricing:** labour budget = Σ (code qty × budgeted minutes × phase rate). Material budget = the existing material-section subtotals grouped by phase (costing spec §5 mapping).
- **Save as Job:** write `job_cost_budgets` (one labour row per code, material rows per phase) + a `job_estimate` row. Reconciliation note if the coded labour total drifts from the quote's labour subtotal (costing spec §5).
- **Touches:** `features/estimator` (template picker, cost-code panel, `createJobFromEstimate`), `features/job-costing` (budget write, the unified template store).

## Slice 2 — Mozaik CSV import

**Goal:** drop a Mozaik export → auto-fill the draft estimate's cabinet counts + material BOM + labour breakdown, then re-price (Slice 1 machinery does the pricing).

> **Big simplifier (2026-06-22): the Mozaik pricing template is adjustable.** Andrew can edit what Mozaik's CSV emits (e.g. drop the CNC machining-time line, add fields). So rather than reverse-engineer Mozaik's default export, **we co-design the exact CSV the app wants** and Andrew configures Mozaik to produce it — a far simpler, more stable parser. The sample below is the *current* default; the **co-designed target shape is now locked** in `docs/samples/mozaik-import-target-csv.md` (with a parser fixture `mozaik-import-target-sample.csv`).
>
> **CSV shape decided (Andrew, 2026-06-22):**
> - Source template = Mozaik's existing **"Job Costing"** pricing template (Pricing tab → Export → CSV); the PDFs confirm it ships in the dropdown.
> - **Cabinet quantity = BOTH** per type — a **count** row (`#`, drives the per-cabinet cost codes + timer) and a **linear-feet** row (`Ft`, size tag for the learning loop).
> - **Per-room breakdown is preserved** — each room is its own sub-group on the estimate (own counts + budget lines) and the parser also rolls a job total. All rooms must be fully expanded in the export.
> - **Machining (Hrs) line dropped**; in-house cut price = `# Sheets` × tracked min/sheet, Toolpath = their quote (ADR 0012 Cut make-vs-buy).

### The file (from `docs/samples/mozaik-export-sample.csv`)
- Columns: `Description, QTY, Units (# / SqFt / Ft / C.Ft / Hrs / %), Amount (unit $), Total`.
- **Per room** (Kitchen, Ensuite Vanity, …), a fixed section stack, then **job-level** Sales Tax / Additional Job Expenses / Markup. Indentation marks hierarchy; `══════ X ══════` rows are section headers; sub-group rows (Materials, Cabinets, Hinges…) then indented line items.
- One file = **one job, summed across its rooms.**

### Proposed mapping (Mozaik line → app) — *review this*
**Labour → cost codes** (the high-value rows; counts are explicit):
| Mozaik row | App cost code | Qty source |
|---|---|---|
| Assembly of Base Cabinetry | `ASM-BASE` | count (13) |
| Assembly of Wall Cabinetry | `ASM-WALL` | count (3) |
| Assembly of Tall Cabinetry | `ASM-TALL` | count (6) |
| Machining Time | `CNC` | **hours (8.11)** ⚠️ see note |
| Finished Surfaces … (sqft) | `FIN-SPRAY` | sqft (25.55) |
| Installation of Base/Wall/Tall Cabinetry | `INST-BASE/…` | count |
| Packing / Delivery Charge per cabinet | `DEL-LOAD` | count / volume |

**Materials → Catalog** (re-priced by the app): the "Materials" sheet rows (3/4 Melamine, 5/8 Ply Birch ×19…) and the "Hardware" rows (Blum Movento ×23, Richelieu Leg ×12, Shelf Pins ×40) → matched to catalog items by name, qty from `#`. Builds the per-job **BOM** (→ Inventory later).

**Subtrades → job_trades:** "Sub Contractor – Plumbing / Electrician / Painter" rows.

**Overhead / Design:** Additional Job Expenses (Assembly/Delivery flat rates, warranty, fuel, permits) → overhead; Design Fee + Field Measurements → Design phase.

### The "Cut" phase — make-vs-buy (Toolpath CNC vs in-house table saw)  ⭐ resolved 2026-06-22
**Andrew owns no CNC — just a sliding table saw.** So "CNC" only ever means **Toolpath** (the sub who CNC-cuts + edgebands). In-house cutting is **table-saw cut + edgeband**, a different operation. The phase currently labelled "CNC/Cut" should read **"Cut"** for this shop, and the in-house cost code is **table-saw cut+band**, never "CNC."

Getting parts cut + banded is sourced **two ways, per job** — make-vs-buy, shown side by side on the estimate:
- **In-house (table saw)** = the shop's tracked **minutes/sheet** to cut + band on the table saw (from timed sessions) × sheet count × shop rate. **Sharpens every job** (the learning loop); a hand-set default until there's history. Sheet count from the Materials BOM (Mozaik or manual).
- **Toolpath (CNC, sub)** = **Toolpath's quote** — they estimate each job; Andrew enters it on the trade-line. (Optional stored $/sheet rate as a ballpark before their quote lands.) **Not** from Mozaik.

Andrew picks → in-house → a labour `job_cost_budgets` row + timed actuals; Toolpath → a Cut **trade-line** (`job_trades` → Toolpath) + subtrade actual; the other stays as a reference. On **small jobs** the table saw often beats Toolpath's minimums — the compare makes that visible. Pattern generalises (Finishing/Install could sub out too), but **Cut/Toolpath is the v1 case**.

### Other mapping nuances
- **CNC unit:** Mozaik gives machining in *hours*; the `CNC` code's driver is *per-sheet*. For the in-house price use either (hours × shop rate, simplest) or (sheets from the Materials section × per-sheet rate). The timer still tracks per-sheet actuals regardless.
- **Cabinet granularity** = Base/Wall/Tall (from the labour rows), not Mozaik's full cabinet-type list. The "Cabinets" sub-list is informational.
- **Mozaik's prices are dropped** (ADR 0012) — only QTY/Units/structure are read. (The machining total is *not* used as Toolpath's price — that comes from Toolpath's own quote.)

### Mapping maintenance
A **built-in default mapping** (seeded from the sample's standard labels) + a **review screen** on import that shows parsed rows, flags **unmatched** lines (new materials, label changes), and lets Andrew map/skip on the fly. No separate mapping table to hand-maintain. Catalog materials not yet in the catalog → flagged for "add to catalog or skip."

### Flow
Drop CSV on the estimator → parse → show review (counts, BOM, labour, unmatched) → confirm → fills the draft estimate (cabinet summary + cost-code panel + material lines) → Slice 1 re-prices → Save as Job.

- **Touches:** new `features/estimator/lib/mozaikImport.ts` (parser + mapping), a review modal, wired into the estimator. Parser test fixture: `docs/samples/mozaik-export-sample.csv`.

## Open items for Andrew's review
1. ~~CNC mapping~~ — **resolved**: make-vs-buy (Toolpath vs in-house), above.
2. ~~Cabinet quantity unit~~ — **resolved**: BOTH (count drives the budget, linear ft is a size tag).
3. ~~Multi-room handling~~ — **resolved**: keep per-room breakdown + a job-total rollup.
4. The rest of the **Mozaik→cost-code mapping table** — right codes for the other rows? (Strawman in `docs/samples/mozaik-import-target-csv.md`.)
5. **Material name matching** — match Mozaik material names to catalog by exact name, or fuzzy + confirm? (Your catalog must hold them to re-price.) — *Slice-2 build decision.*
6. **Subtrades** — the Sub-Contractor rows (Plumbing/Electrician/Painter): auto-create `job_trades` lines, or just surface them? — *Slice-2 build decision.*
7. Confirm **built-in default mapping + review screen** (vs a mapping table you maintain). — *Slice-2 build decision.*

## Verification (per slice)
- Slice 1: `tsc`/`lint`/`build`; create a template, load it on an estimate, enter counts, Save as Job → assert `job_cost_budgets` rows written; reconciliation note fires on drift.
- Slice 2: unit-test the parser against `mozaik-export-sample.csv` (asserts 13/3/6 cabinet counts, 8.11 machining hrs, the sheet/hardware BOM, multi-room sum); then drop it in the running estimator and walk the review → Save as Job.
