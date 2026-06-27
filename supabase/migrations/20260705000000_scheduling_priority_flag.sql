-- Scheduling & Client-Commitment Engine — S17: Priority/VIP flag + manual
-- bump-with-impact (cross-job conflict resolution) (issue #105, ADR 0020).
--
-- A "Priority/VIP" job wins ties in EDD/bottleneck advice and surfaces first
-- in capacity conflicts. A deliberate BUMP action logs the impact (which job
-- was pushed, how many days, to protect which priority job) before committing
-- so the bumped job routes through the re-commit + approval flow.
--
-- Two additive changes to the schema:
--   1. jobs.is_priority boolean — marks a job as Priority/VIP.
--   2. public.priority_bumps — immutable audit log of every bump decision:
--        who got pushed, how many days, which priority job was protected,
--        old/new committed dates, reason, who made the call, when.
--
-- All changes are ADDITIVE so existing rows keep working untouched.
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).

-- ── 1. Priority flag on jobs ─────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.is_priority IS
  'S17: when true this job is Priority/VIP — it wins ties in EDD/bottleneck '
  'advice and surfaces first in capacity conflicts on the fever board.';

-- ── 2. Bump audit log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.priority_bumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Priority/VIP job being protected.
  -- jobs.id is TEXT in this project — the FK column must match.
  priority_job_id text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- The job that is being pushed out to make room for the priority job.
  bumped_job_id text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- Number of work days the bumped job's committed date is pushed.
  bump_days integer NOT NULL CHECK (bump_days > 0),
  -- Why the bump was made (free text — the owner picks their words).
  reason text NOT NULL,
  -- The bumped job's committed install date before the bump.
  old_committed_date date,
  -- The bumped job's new committed install date after the bump.
  new_committed_date date NOT NULL,
  -- Who made the call (auth email / display name; best-effort).
  bumped_by text,
  bumped_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.priority_bumps IS
  'S17: immutable audit log of every deliberate bump decision — a priority job '
  'protection that pushes another job''s committed date to make room. One row '
  'per confirmed bump: which job was pushed, how many days, to protect which '
  'priority job, old/new committed dates, reason, who/when.';

CREATE INDEX IF NOT EXISTS priority_bumps_priority_job_idx
  ON public.priority_bumps (priority_job_id, bumped_at DESC);

CREATE INDEX IF NOT EXISTS priority_bumps_bumped_job_idx
  ON public.priority_bumps (bumped_job_id, bumped_at DESC);

ALTER TABLE public.priority_bumps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "priority_bumps_auth_all" ON public.priority_bumps;
CREATE POLICY "priority_bumps_auth_all"
  ON public.priority_bumps FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "priority_bumps_anon_none" ON public.priority_bumps;
CREATE POLICY "priority_bumps_anon_none"
  ON public.priority_bumps FOR ALL TO anon USING (false) WITH CHECK (false);

-- Reload PostgREST schema cache so the new table and column are queryable now.
NOTIFY pgrst, 'reload schema';
