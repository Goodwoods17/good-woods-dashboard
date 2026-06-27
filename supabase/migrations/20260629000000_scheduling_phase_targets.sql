-- Scheduling & Client-Commitment Engine — S1 foundation (ADR 0020).
--
-- Adds the DUAL-SCHEDULE columns to public.jobs (CCPM model): live INTERNAL
-- per-phase target dates + a job-level internal target + a pooled buffer.
-- The CLIENT-COMMITTED install date stays `public.jobs.install_date`,
-- UNCHANGED — it remains the frozen promise; the internal targets are additive.
--
-- All columns are nullable / default-0 and additive, so existing rows keep
-- working untouched (no backfill, no data rewrite). RLS is inherited from the
-- existing public.jobs policies — no new policy needed for added columns.
--
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod) — the schema can
-- land staged while the UI stays dormant.
--
-- Apply with the Supabase MCP / SQL editor, then reload the PostgREST cache.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS phase_target_dates jsonb,
  ADD COLUMN IF NOT EXISTS internal_target_date date,
  ADD COLUMN IF NOT EXISTS buffer_days integer;

COMMENT ON COLUMN public.jobs.phase_target_dates IS
  'Per-phase INTERNAL target dates: jsonb map keyed by the six MilestoneStage phases (design/cnc/assembly/finishing/delivery/install) → ISO date. Additive to install_date (the frozen client-committed promise). NULL = no internal targets set.';
COMMENT ON COLUMN public.jobs.internal_target_date IS
  'Job-level internal target — the honest internal finish, ahead of the committed install_date. NULL = none.';
COMMENT ON COLUMN public.jobs.buffer_days IS
  'Pooled CCPM buffer in days between the internal target and the committed install_date. NULL = unset (treated as 0).';

NOTIFY pgrst, 'reload schema';
