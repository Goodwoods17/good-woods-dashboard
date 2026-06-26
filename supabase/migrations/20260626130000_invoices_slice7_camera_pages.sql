-- Slice 7: multi-page camera capture (PWA).
--
-- Adds an optional `pages` column to `invoices` to store the full ordered list
-- of Storage paths when a capture session produces more than one snapped page.
-- For single-file uploads this stays NULL; `storage_path` is always the primary
-- entry point for the extractor (page 1 or the sole uploaded file, ADR 0019).
--
-- Additive-only (nullable column) — safe to replay; never drops or alters.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pages jsonb;

COMMENT ON COLUMN invoices.pages IS
  'Ordered Storage paths for multi-page camera captures. '
  'NULL for single-file uploads. storage_path always = page 1.';
