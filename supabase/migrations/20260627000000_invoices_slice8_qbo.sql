-- Invoices Slice 8 — QuickBooks-ready shape (issue #53).
-- See features/invoices/PLAN.md (Slice 8) and features/invoices/CLAUDE.md.
--
-- Adds the two QBO-mappable fields needed to construct a QBO Bill without
-- rework in the future sync phase:
--   • invoices.qbo_vendor_id  → QBO Bill VendorRef.value
--   • invoice_lines.qbo_account → QBO Bill AccountBasedExpenseLineDetail.AccountRef.value
--
-- Tax codes are already QBO-ready: taxFlag=true/"TAX", taxFlag=false/"NON";
-- GST and PST are stored separately (never collapsed — ADR 0019) and map
-- directly to QBO TxnTaxDetail.TotalTax = gst + pst.
--
-- ADDITIVE-ONLY per the overnight-build mandatory constraints:
-- new nullable text columns; no DROP, no destructive ALTER, no row mutation.
-- Owner applies to prod AFTER review. /invoices route stays flag-gated.

-- ─── invoices: QBO vendor reference ─────────────────────────────────────────
-- Stores the QBO Vendor ID (or free-text name) that this invoice's supplier
-- maps to.  Null until the owner assigns it; the export stub returns it as-is
-- so the future sync layer can send it to QBO VendorRef.value without changes.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text;

COMMENT ON COLUMN public.invoices.qbo_vendor_id IS
  'QBO vendor mapping for the future QuickBooks sync phase. '
  'Maps to QBO Bill VendorRef.value. NULL until the owner assigns it.';

-- ─── invoice_lines: QBO expense account ─────────────────────────────────────
-- Stores the QBO Account code (e.g. "5000-Materials") for each line.
-- Null until the owner assigns it; the export stub returns it as accountRef
-- → AccountBasedExpenseLineDetail.AccountRef.value.
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS qbo_account text;

COMMENT ON COLUMN public.invoice_lines.qbo_account IS
  'QBO expense account code for the future QuickBooks sync phase. '
  'Maps to AccountBasedExpenseLineDetail.AccountRef.value. NULL until assigned.';
