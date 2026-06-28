-- S23 (P6): one-way Google Calendar push — OAuth connection + per-target event map.
--
-- The app is the single source of truth; we push the schedule INTO the owner's
-- Google Calendar and never read back (dodges the two-way 410 dragon). Two
-- additive tables, both RLS authenticated-only + anon-none (owner-only data;
-- the client portal never touches these).
--
-- Ships behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED (off in prod until flipped).
-- job_id matches jobs.id which is TEXT (not uuid) — see the jobs table.

-- ── OAuth connection (one row per connected Google account) ──────────────────
-- The long-lived refresh token is stored ENCRYPTED at rest (AES-256-GCM, keyed
-- by GOOGLE_TOKEN_ENC_KEY server-side); the plaintext token never lands here.
CREATE TABLE IF NOT EXISTS public.scheduling_google_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The authenticated user who connected the account (owner). Stored as text to
  -- mirror the rest of the scheduling tables' created_by convention.
  connected_by             text,

  -- Display-only Google account email (so the UI can show which account is wired).
  google_account_email     text,

  -- Target calendar; 'primary' = the account's default calendar.
  calendar_id              text NOT NULL DEFAULT 'primary',

  -- Encrypted refresh token blob (iv.tag.ciphertext, base64). NEVER plaintext.
  encrypted_refresh_token  text NOT NULL,

  -- The granted scope string (recorded for audit / least-privilege checks).
  scope                    text,

  connected_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scheduling_google_connections IS
  'Owner Google Calendar OAuth connection for the one-way schedule push (S23). '
  'Holds the AES-256-GCM-encrypted refresh token; plaintext never stored.';

-- ── Per-job-per-target event map (idempotent upsert anchor) ──────────────────
CREATE TABLE IF NOT EXISTS public.scheduling_google_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id           text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Stable identity (e.g. '<jobId>:phase:cnc', '<jobId>:committed-install').
  -- One Google event per sync_key — the upsert key for the one-way push.
  sync_key         text NOT NULL UNIQUE,

  -- The Google Calendar event id we created for this sync_key.
  google_event_id  text NOT NULL,

  -- The all-day date we last pushed for this event (drives the update-on-move diff).
  synced_date      date NOT NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scheduling_google_events IS
  'Maps a job''s schedule targets to Google Calendar event ids so the one-way '
  'push (S23) is idempotent — create on first push, patch on date move, delete '
  'when a target is removed.';

CREATE INDEX IF NOT EXISTS scheduling_google_events_job_idx
  ON public.scheduling_google_events (job_id);

-- ── RLS: owner-only on both tables; anonymous (client portal) sees nothing ───
ALTER TABLE public.scheduling_google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_google_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduling_google_connections_authenticated_all
  ON public.scheduling_google_connections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY scheduling_google_connections_anon_none
  ON public.scheduling_google_connections
  FOR ALL TO anon USING (false);

CREATE POLICY scheduling_google_events_authenticated_all
  ON public.scheduling_google_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY scheduling_google_events_anon_none
  ON public.scheduling_google_events
  FOR ALL TO anon USING (false);
