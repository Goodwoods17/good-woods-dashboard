# 0012. One unified Job template; Mozaik import seeds quantities, the app prices

Date: 2026-06-22

## Status

**Accepted.** Resolved in a grilling session with Andrew, 2026-06-22, while
scoping the cost-code task templates (P2b) and the Mozaik CSV import. Builds on
ADR 0006 (Catalog = materials only; Labour holds cost codes + time history),
ADR 0009 (budget frozen on the job), and ADR 0010 (QuickBooks-ready). Supersedes
the implicit split between the estimator's section-templates and the standalone
P2b task templates.

## Context

Two problems surfaced while planning P2b:

1. **Three "template" concepts for the same thing.** The app already had estimator
   **section-templates** ("Full custom build", "Install only", "Refacing"…), a job
   **`template`** string field (`full_project`, `install_only`…), and the new P2b
   **cost-code task templates**. "Install only" existed three times, on three axes.
2. **Mozaik exports a complete priced estimate** (see `docs/samples/mozaik-export-sample.csv`):
   per-room sections that map almost 1:1 onto the 6 phases — explicit cabinet counts
   by type (Base 13 / Wall 3 / Tall 6), machining hours, finishing sqft, a hardware
   BOM with quantities, and detailed install lines. The question was whether to trust
   its prices or just its quantities.

## Decision

1. **One unified "Job template."** Fold the three into a single concept: a named job
   type (e.g. "Full kitchen", "Install only") that defines (a) which quote sections
   show, (b) the **set of cost codes** the job uses, and (c) default overhead/markup.
   It **references** labour cost codes by id — it does not copy them (codes stay in
   the Labour DB per ADR 0006). The job `template` field becomes a reference to the
   template used. P2b's standalone `cost_code_templates` table/UI is **reworked into**
   this unified template before shipping (PR #9 does **not** merge as-is).

2. **A template is a task *set*, not fixed quantities.** Per-job quantities come from
   the job — entered manually (cabinet counts) or via the Mozaik import.

3. **Mozaik import seeds quantities + structure only; the app re-prices.** A dropped
   Mozaik CSV fills the cabinet counts, material BOM, and labour breakdown. The app
   then computes the money with its **own catalog prices + labour rates + cost codes**.
   Mozaik's dollar amounts are **not** imported as the budget. (Mozaik's pricing
   template is maintained separately and has known tax issues; the app's cost-code
   system is the single source of truth for money and budget-vs-actual.)

4. **A Mozaik drop lands as a draft estimate the user reviews/adjusts**, then
   *Save as Job* freezes the budget (`job_cost_budgets`, job-costing P3).

5. **Sequencing:** Slice 1 = unify the template + manual quantities + the
   template→cost-code-budget loop. Slice 2 = the Mozaik CSV import, as its own build.

6. **The "Cut" phase is make-vs-buy (Toolpath CNC vs in-house table saw), per job.**
   Andrew owns **no CNC — just a sliding table saw** — so "CNC" only ever means the
   **Toolpath** sub; in-house cutting is **table-saw cut + edgeband**. (The phase
   labelled "CNC/Cut" should read **"Cut"** for this shop; cost codes use table-saw
   language, not CNC.) The estimate shows **both prices side by side** and Andrew
   picks which becomes the budget:
   - **In-house (table saw)** = the shop's tracked **minutes/sheet** to cut + band
     (from timed sessions) × sheet count × shop rate — sharpens every job (the
     learning loop); a hand-set default until there's history.
   - **Toolpath** = **Toolpath's quote** (they estimate each job; Andrew enters it).
     **Not** Mozaik's machining total — that is not Toolpath's price.

   In-house pick → a labour budget row + timed actuals; Toolpath pick → a CNC/Cut
   trade-line + subtrade actual; the other stays as a reference. On small jobs
   in-house often wins — the compare makes that visible. Generalises to other phases
   later; CNC/Toolpath is the v1 case.

## Alternatives considered

- **Keep three separate template concepts.** Less rework now (P2b ships as built), but
  permanent triple-maintenance of every job type — exactly the confusion to avoid.
- **Trust Mozaik's prices.** Fastest import, but bypasses the cost-code budget, couples
  the app to Mozaik's pricing template, and kills budget-vs-actual. Rejected.
- **Templates carry fixed quantities.** Faster for identical repeat jobs, but every real
  kitchen differs in cabinet count, so you'd always be correcting numbers. Rejected.

## Consequences

- The **estimator** is where a template is applied, Mozaik is dropped, re-pricing
  happens, and Save-as-Job freezes the budget.
- The Mozaik import depends on the **Catalog holding the materials** (to re-price);
  unmatched Mozaik lines get a review/map step rather than silently dropping.
- **Cabinet granularity is Base / Wall / Tall** (matching both the cost codes and
  Mozaik's labour rows), not Mozaik's full cabinet-type list.
- One place to define a job type; one name; the cost code remains the thread from
  template → estimate → card → timer → actuals.
- **The "CNC/Cut" phase relabels to "Cut"** (Andrew owns no CNC); in-house cut codes
  use table-saw language. CNC = Toolpath only.
- **The Mozaik CSV shape is co-designed, not reverse-engineered.** Andrew can edit
  Mozaik's pricing template, so the parser targets a CSV shape agreed between the app
  and Mozaik (pending Mozaik's template-capability docs) — simpler, more stable than
  parsing the default export.
