# 0010. QuickBooks-ready costing model

Date: 2026-06-20

## Status

**Accepted.** Forward-looking constraint on the cost-codes / live job-costing
feature (spec: `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md`).
Andrew confirmed a future QuickBooks integration; this ADR fixes the terminology
and entity shapes so that integration is a **mapping, not a remodel**. Builds on
ADR 0009 (budget on job) and the multi-estimate/invoice change-order workflow
captured in `docs/domain.md`.

## Context

Spacecraft will integrate with QuickBooks later (already foreshadowed in
`features/projects/CLAUDE.md`). Andrew's change-order workflow — *a new estimate
+ new invoice within the same project* — mirrors QB's first-class **Estimate** and
**Invoice** objects, and the whole "budget vs. actual per job" mirrors QuickBooks
Online's **Project profitability / Estimates-vs-Actuals**. Model this feature in a
QB-shaped way now and the integration becomes a field mapping; model it ad-hoc and
it becomes a rebuild.

## Decision

**Shape the costing model and its vocabulary to map 1:1 onto QuickBooks — but do
not build the sync.**

1. **Canonical mapping:**

   | This feature | QuickBooks |
   | --- | --- |
   | Project (`Job`) | Project (under a Customer) |
   | Client / Payer | Customer |
   | Estimate (budget batch) | Estimate |
   | Invoice (revenue cycle) | Invoice |
   | Phase | Class |
   | Cost code (operation + code) | Product/Service item |
   | Worker | Employee |
   | Labour Session | Time Activity |
   | Supplier *and* Subtrade | Vendor |
   | Material / subtrade cost-actual | Bill / Expense |
   | Budget-vs-Actual / projected margin | Project profitability (Estimates vs Actuals) |

2. **Estimate and Invoice become light first-class records.** A project holds many
   `job_estimates` (original + change orders; each owns its budget lines) and many
   `job_invoices` (each adds revenue). These are **summary** records that mirror
   the QB objects — *not* a re-editable estimate document. ADR 0009 still stands:
   the estimator's working state is not persisted; an Estimate record is the
   durable summary it emits on _Save as Job_.

3. **Totals roll up:** project revenue = Σ its Invoices; project budget = Σ its
   Estimates' lines. `Job.revenue` stays the canonical revenue **rollup** (= Σ
   invoices) so existing P&L keeps working unchanged; Invoice records add the
   per-cycle breakdown beneath it.

4. **No `quickbooks_id` columns or sync table in v1.** Getting the shapes + names
   right is the readiness deliverable. When the sync lands, a single central
   `quickbooks_links` mapping table (local entity ↔ QB id) is a **pure addition** —
   no existing table changes — precisely because the shapes already line up.

## Alternatives considered

- **Bake `quickbooks_id` into every entity now.** Rejected — months of empty
  columns that rot and mislead; a central mapping table added at integration time
  is cleaner and needs no remodel, given the aligned shapes.
- **Defer Estimate/Invoice modeling; track only a single revenue number** (the
  earlier lean). Rejected once the change-order workflow + QB plan were clear:
  change orders genuinely *are* multiple estimates+invoices per project, and QB
  models them first-class. A single revenue field would misrepresent the project
  and force rework at integration.
- **Build full QB parity now** (classes, two-sided items, the sync). Rejected —
  that's the integration project, not this feature. Mirror the shapes, not the
  machinery.

## Consequences

- New light `job_estimates` and `job_invoices` tables, each project-scoped;
  `job_cost_budgets` rows belong to a `job_estimate`; revenue derives from
  `job_invoices`. `Job.revenue` becomes a rollup (= Σ invoices) so `computeMargin`
  / P&L are untouched; the legacy embedded `Job.invoice` is sequenced into
  `job_invoices` carefully against the existing invoice-render path (a plan-level
  migration detail, not a v1 rewrite of invoicing).
- **Phase = QB Class** and **Cost code = QB Item**: documented so the integration
  — and any interim CSV export for the bookkeeper — use the same axes.
- The eventual QB sync is a mapping table + field push/pull, **not** a schema
  migration of the core costing tables.
- Terminology (Project, Estimate, Invoice, Phase/Class, Cost code/Item, Vendor) is
  fixed in `docs/domain.md`.
