-- Scheduling & Client-Commitment Engine — S11: trade-line dates + sub
-- request/confirm + accountability (issue #99, ADR 0020).
--
-- Adds scheduling date columns to public.job_trades and a new
-- public.subtrade_reliability table for per-sub date-keeping history.
-- All changes are ADDITIVE and nullable so existing rows keep working untouched.
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
-- RLS is inherited from the existing job_trades policy for the columns;
-- subtrade_reliability gets its own authenticated-only + anon-none policies.

-- ─── 1. Date columns on job_trades ──────────────────────────────────────────

ALTER TABLE public.job_trades
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS sub_committed_date date,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

COMMENT ON COLUMN public.job_trades.requested_date IS
  'The date we (Andrew) asked the sub to be on-site or deliver by. NULL = not yet set.';
COMMENT ON COLUMN public.job_trades.sub_committed_date IS
  'The date the sub confirmed (via token email or recorded after a call). NULL = awaiting confirmation.';
COMMENT ON COLUMN public.job_trades.confirmed_at IS
  'When the sub committed to their date (token submit or manual recording). NULL = unconfirmed.';
COMMENT ON COLUMN public.job_trades.confirmation_token IS
  'UUID token emailed to the sub for the request/confirm flow. NULL = no pending email request. Unique so a collision is impossible; set null on confirm.';
COMMENT ON COLUMN public.job_trades.token_expires_at IS
  'Expiry for the confirmation_token (72h from issue). Past expiry = token invalid, must re-request. NULL when no token is pending.';

-- Unique index on the token so the confirm route can look it up in O(1).
CREATE UNIQUE INDEX IF NOT EXISTS job_trades_confirmation_token_idx
  ON public.job_trades (confirmation_token)
  WHERE confirmation_token IS NOT NULL;

-- ─── 2. subtrade_reliability ────────────────────────────────────────────────
-- One row per job_trades line that has a sub_committed_date; records whether
-- the sub met their date. Used by computeSubReliabilityBufferDays (tradeDates.ts)
-- to earn extra buffer for unreliable subs on the next job.

CREATE TABLE IF NOT EXISTS public.subtrade_reliability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subtrade_id uuid NOT NULL REFERENCES public.subtrades(id) ON DELETE CASCADE,
  job_trade_id uuid NOT NULL REFERENCES public.job_trades(id) ON DELETE CASCADE,
  committed_date date NOT NULL,
  actual_done_date date,
  missed boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- At most one reliability record per trade-line (the outcome of that line).
  UNIQUE (job_trade_id)
);

COMMENT ON TABLE public.subtrade_reliability IS
  'Per-trade-line outcome: did the sub meet their committed date? Used to earn more buffer for unreliable subs. One row per job_trades line with a sub_committed_date; recorded when the line is marked done (or auto-raised when the date passes and status stays booked/needed).';
COMMENT ON COLUMN public.subtrade_reliability.missed IS
  'True when the sub was late — committed_date passed and status was not done by that date. Set automatically by the auto-raise flow in the UI.';

CREATE INDEX IF NOT EXISTS subtrade_reliability_subtrade_idx
  ON public.subtrade_reliability (subtrade_id);
CREATE INDEX IF NOT EXISTS subtrade_reliability_missed_idx
  ON public.subtrade_reliability (subtrade_id) WHERE missed = true;

ALTER TABLE public.subtrade_reliability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subtrade_reliability_auth_all" ON public.subtrade_reliability;
CREATE POLICY "subtrade_reliability_auth_all"
  ON public.subtrade_reliability FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "subtrade_reliability_anon_none" ON public.subtrade_reliability;
CREATE POLICY "subtrade_reliability_anon_none"
  ON public.subtrade_reliability FOR ALL TO anon USING (false) WITH CHECK (false);

-- Reload PostgREST schema cache so new columns + table are queryable immediately.
NOTIFY pgrst, 'reload schema';
