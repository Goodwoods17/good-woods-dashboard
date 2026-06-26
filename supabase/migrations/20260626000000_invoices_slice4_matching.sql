-- Invoices Slice 4 — supplier + job matching schema additions.
-- See features/invoices/PLAN.md (Slice 4) and issue #49.
--
-- ADDITIVE-ONLY per the overnight-build mandatory constraints:
-- new nullable FK columns on existing tables; no DROP, no ALTER TYPE,
-- no data mutation. Owner applies to prod AFTER review.

-- ─── invoices: link to the resolved catalog supplier ─────────────────────────
-- Null until the owner resolves it in the match UI; then set to the
-- catalog_suppliers.id row that represents this vendor.
alter table public.invoices
  add column if not exists supplier_id uuid
    references public.catalog_suppliers(id) on delete set null;

create index if not exists invoices_supplier_id_idx
  on public.invoices (supplier_id);

-- ─── invoice_lines: assign each line to a job (or shop stock) ────────────────
-- Null = "no job / shop stock" (valid — buy-in not tied to a specific project).
-- Set to the jobs.id the owner assigns this line to in the match UI.
-- Slice 5 (post) reads this to write job_cost_actuals.
-- jobs.id is TEXT (0001_jobs.sql), so job_id must be text — every other table
-- that FKs to jobs uses `job_id text` (a uuid column can't FK a text PK).
alter table public.invoice_lines
  add column if not exists job_id text
    references public.jobs(id) on delete set null;

create index if not exists invoice_lines_job_id_idx
  on public.invoice_lines (job_id);
