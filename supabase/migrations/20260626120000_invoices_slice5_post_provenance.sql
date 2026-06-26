-- Invoices Slice 5 — post to actuals + provenance.
-- See features/invoices/PLAN.md (Slice 5) and issue #50.
--
-- ADDITIVE-ONLY per the overnight-build mandatory constraints:
-- new nullable columns + an index on an existing table; no DROP, no ALTER TYPE,
-- no data mutation. Owner applies to prod AFTER review.
--
-- Posting a reviewed invoice writes one job_cost_actuals row per job-assigned
-- line. These columns make each written actual traceable back to its source
-- invoice line (provenance / audit trail), and carry the "with PST" figure
-- shown alongside the pre-tax headline actual (ADR 0019 tax basis).

-- ─── provenance: link an actual back to its originating bill + line ──────────
alter table public.job_cost_actuals
  add column if not exists source_invoice_id uuid
    references public.invoices(id) on delete set null;

alter table public.job_cost_actuals
  add column if not exists source_invoice_line_id uuid
    references public.invoice_lines(id) on delete set null;

-- ─── tax basis: pre-tax `amount` is the headline; this is the "with PST" ─────
-- Null for manually logged actuals (no tax captured) — readers fall back to
-- `amount` in that case.
alter table public.job_cost_actuals
  add column if not exists amount_with_tax numeric;

create index if not exists job_cost_actuals_source_invoice_idx
  on public.job_cost_actuals (source_invoice_id);
