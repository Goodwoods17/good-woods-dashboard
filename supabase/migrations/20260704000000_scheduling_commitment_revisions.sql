-- Scheduling & Client-Commitment Engine — S14: re-commit flow + revision
-- history + reason codes + change-order handling (issue #102, ADR 0020).
--
-- The client-committed install date is a PROMISE and is VERSIONED — never
-- silently overwritten. Every deliberate change lands one immutable row here:
-- old date / new date / fresh buffer / reason code / who / when, plus whether it
-- dings the shop's reliability scorecard (S25). Two kinds:
--   – 'recommit'     : the shop's schedule slipped (recovery-first; only after
--                      the buffer is truly blown). A shop-attributable reason
--                      dings reliability.
--   – 'change_order' : added scope re-evaluated the schedule and proposed a new
--                      committed date bundled into the change-order approval.
--                      NEVER dings reliability; small ones absorb into buffer.
--
-- All changes are ADDITIVE so existing rows keep working untouched.
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).

CREATE TABLE IF NOT EXISTS public.commitment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- jobs.id is TEXT in this project (not uuid) — the FK column must match.
  job_id text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recommit', 'change_order')),
  reason_code text NOT NULL,
  -- The committed install date as it stood before this revision (NULL if first).
  old_committed_date date,
  -- The new committed install date this revision lands. Required.
  new_committed_date date NOT NULL,
  old_buffer_days integer,
  new_buffer_days integer,
  -- True when this revision dings the shop's date-keeping reliability scorecard
  -- (S25). A change order is always false; a re-commit is true only on a
  -- shop-attributable reason.
  dings_reliability boolean NOT NULL DEFAULT true,
  note text,
  -- Who made the call (auth email / name); free-text, best-effort.
  revised_by text,
  revised_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commitment_revisions IS
  'S14: versioned history of the client-committed install date. One immutable row per deliberate change (re-commit or change order) — old/new date, fresh buffer, reason code, who/when, and whether it dings reliability (S25). The committed date is never silently overwritten.';
COMMENT ON COLUMN public.commitment_revisions.dings_reliability IS
  'True when this revision counts against the shop''s date-keeping reliability (S25). Change orders are always false; re-commits are true only for shop-attributable reasons.';

CREATE INDEX IF NOT EXISTS commitment_revisions_job_idx
  ON public.commitment_revisions (job_id, revised_at DESC);

ALTER TABLE public.commitment_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commitment_revisions_auth_all" ON public.commitment_revisions;
CREATE POLICY "commitment_revisions_auth_all"
  ON public.commitment_revisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commitment_revisions_anon_none" ON public.commitment_revisions;
CREATE POLICY "commitment_revisions_anon_none"
  ON public.commitment_revisions FOR ALL TO anon USING (false) WITH CHECK (false);

-- Reload PostgREST schema cache so the new table is queryable now.
NOTIFY pgrst, 'reload schema';
