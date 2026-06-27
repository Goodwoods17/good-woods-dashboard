-- Scheduling & Client-Commitment Engine — S13: commitment ledger +
-- two-level ownership + per-owner/sub reliability (issue #101, ADR 0020).
--
-- Dates-as-promises (Flores / Last-Planner): every date is an explicit
-- commitment with a NAMED OWNER, at two levels —
--   1. the client-committed install date, owned by the shop;
--   2. each phase's internal target, owned by its assigned person / subtrade.
-- Reliability is tracked PER OWNER (subtrades included) and earns extra pooled
-- buffer on the next job, generalizing S11's subtrade-only reliability loop.
--
-- All changes are ADDITIVE and nullable so existing rows keep working untouched.
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).

-- ─── 1. Per-phase owners on jobs ─────────────────────────────────────────────
-- Maps each MilestoneStage phase to its owner descriptor
--   { "kind": "shop"|"person"|"subtrade", "id": uuid|null, "name": text }
-- NULL / absent phases default to the shop. The install date (jobs.install_date)
-- is always shop-owned and needs no column.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS phase_owners jsonb;

COMMENT ON COLUMN public.jobs.phase_owners IS
  'S13: named owner per phase, keyed by MilestoneStage → { kind, id, name }. NULL/absent = shop-owned. The client-committed install is always shop-owned.';

-- ─── 2. commitment_ledger ────────────────────────────────────────────────────
-- The durable per-owner promise ledger. Generalizes subtrade_reliability (S11)
-- across every owner kind so `ownerReliabilityBufferDays` can size buffer from
-- the shop's OWN date-keeping as well as its subs'. One row per recorded
-- commitment outcome (client install or a phase internal target).

CREATE TABLE IF NOT EXISTS public.commitment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- 'client' = the shop's install promise; 'phase' = an internal phase target.
  level text NOT NULL CHECK (level IN ('client', 'phase')),
  -- MilestoneStage key for phase-level rows; NULL for the client install.
  phase text,
  owner_kind text NOT NULL CHECK (owner_kind IN ('shop', 'person', 'subtrade')),
  -- subtrade/person row id when known; NULL for the shop or an ad-hoc owner.
  owner_id uuid,
  owner_name text NOT NULL,
  committed_date date NOT NULL,
  actual_date date,
  -- 'open' until resolved; 'kept' if met on/before committed; 'missed' if late.
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'missed')),
  missed boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commitment_ledger IS
  'S13: two-level commitment ledger (dates-as-promises). One row per recorded promise outcome — client install (shop-owned) or a phase internal target (person/subtrade-owned). Feeds ownerReliabilityBufferDays so the buffer learns which owners to trust.';
COMMENT ON COLUMN public.commitment_ledger.missed IS
  'True when the owner was late — committed_date passed and the commitment was not met by then. Drives the per-owner reliability roll-up.';

CREATE INDEX IF NOT EXISTS commitment_ledger_job_idx
  ON public.commitment_ledger (job_id);
CREATE INDEX IF NOT EXISTS commitment_ledger_owner_idx
  ON public.commitment_ledger (owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS commitment_ledger_missed_idx
  ON public.commitment_ledger (owner_kind, owner_id) WHERE missed = true;

ALTER TABLE public.commitment_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commitment_ledger_auth_all" ON public.commitment_ledger;
CREATE POLICY "commitment_ledger_auth_all"
  ON public.commitment_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "commitment_ledger_anon_none" ON public.commitment_ledger;
CREATE POLICY "commitment_ledger_anon_none"
  ON public.commitment_ledger FOR ALL TO anon USING (false) WITH CHECK (false);

-- Reload PostgREST schema cache so the new column + table are queryable now.
NOTIFY pgrst, 'reload schema';
