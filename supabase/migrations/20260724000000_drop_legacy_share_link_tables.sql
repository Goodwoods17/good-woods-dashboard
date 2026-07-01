-- Drop the legacy per-feature share-link tables (issue #269).
--
-- Both `form_share_links` and `schedule_share_links` were superseded by the
-- generalized `share_tokens` capability-link registry (ADR 0022). Forms and
-- Scheduling now READ and WRITE exclusively from `share_tokens`; the writes to
-- these two tables were dead best-effort mirrors, now removed from the code.
--
-- Safe to drop: a row-for-row verify against PROD passed before this migration
-- (0 rows in `form_share_links` + `schedule_share_links`, 0 unmirrored into
-- `share_tokens`), so no data is lost. `cascade` clears the RLS policies and any
-- dependent objects that hung off these tables.

drop table if exists public.form_share_links cascade;
drop table if exists public.schedule_share_links cascade;

-- Refresh the PostgREST schema cache so the dropped tables stop being exposed.
notify pgrst, 'reload schema';
