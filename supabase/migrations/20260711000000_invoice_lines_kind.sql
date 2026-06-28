-- QBO S5 — Material/subtrade kind resolution (issue #151).
-- See features/invoices/PLAN.md (QBO S5) and features/invoices/CLAUDE.md.
--
-- Posting an invoice currently hardcodes job_cost_actuals.kind = 'material'
-- (postInvoice.ts), so subtrade bills mis-book in estimated-vs-actual AND in
-- the QBO bill account. This adds a per-line kind tag the match UI can set, so
-- a subtrade line books to the subtrade bucket/account, not material.
--
-- job_cost_actuals.kind already allows ('material','subtrade','labour_adj')
-- (20260620050000_cost_codes_schema.sql) — no change needed there.
--
-- ADDITIVE-ONLY per the overnight-build mandatory constraints:
-- one new nullable text column with a value CHECK; no DROP, no destructive
-- ALTER, no row mutation. NULL = material (the historical default, so the
-- existing material flow is unchanged). Owner applies to prod AFTER review.

-- ─── invoice_lines: per-line cost kind (material vs subtrade) ────────────────
-- Null until the owner tags the line in the match UI. NULL is read as
-- 'material' by the posting/export brain, preserving prior behaviour for every
-- existing row and every line the owner doesn't explicitly re-tag.
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS line_kind text
    CHECK (line_kind IN ('material', 'subtrade'));

COMMENT ON COLUMN public.invoice_lines.line_kind IS
  'Cost kind this line books as when posted: material | subtrade. '
  'NULL = material (default). Drives job_cost_actuals.kind and the QBO Bill '
  'account bucket so subtrade bills no longer mis-book as material (issue #151).';
