-- Project Files & Sharing (Tier-2) · S8c — drop the four legacy
-- job_pieces.pin_* columns. ADR 0023.
--
-- This is STEP 3 (FINAL) of the strict 3-step pins-promotion order:
--   S8a (20260719000000) — built + backfilled job_piece_pins (additive, dual-read).
--   S8b                   — refactored the mapper + every write site off pin_*,
--                           moved located pins to job_piece_pins, and DEPLOYED.
--   S8c (this migration)  — now that no code reads or writes job_pieces.pin_*,
--                           drop the columns.
--
-- SAFE TO RUN ONLY AFTER S8b IS LIVE. Confirmed before authoring:
--   • grep of features/ shared/ src/ finds no reader/writer of pin_document_id /
--     pin_page / pin_x / pin_y (piecesRowMap.ts mapper omits them; the narrow
--     UPDATE paths in piecesStore + jobProgressStore never send them).
--   • The data already lives in job_piece_pins (S8a backfill), so dropping the
--     embedded columns loses nothing — it only removes the now-dead duplicate.
--
-- Additive-safe: each DROP uses IF EXISTS so a replay (or a re-run against a DB
-- where a prior partial apply already dropped a column) is a no-op, never an
-- error. The columns are nullable with no dependent objects (no FK, no index,
-- no view referenced them), so the drop is a fast catalog-only change.

alter table public.job_pieces
  drop column if exists pin_document_id,
  drop column if exists pin_page,
  drop column if exists pin_x,
  drop column if exists pin_y;

-- Reload PostgREST's schema cache so the dropped columns disappear from the API
-- immediately (PostgREST caches the schema until told to refresh).
notify pgrst, 'reload schema';
