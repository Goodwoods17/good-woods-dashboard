-- QBO S9 (issue #155): push audit log + retry queue.
--
-- Records every QBO Bill push attempt: who triggered it, when, the request
-- body sent to QBO, the raw QBO response, and the outcome.  Failed transient
-- pushes (429 / 502 / 503 / 500) get a `next_retry_at` timestamp so a drain
-- endpoint can re-attempt them with exponential backoff, respecting QBO's
-- ~500-calls/min rate limit.
--
-- Design notes:
--   • One row per attempt — retries create NEW rows with retry_count + 1.
--     The old failed_transient row is marked "retried" (kept for history).
--   • The total-mismatch guard (also S9) is pure-function logic in
--     qboBillPush.ts; no migration needed for that part.
--   • ADDITIVE-ONLY: CREATE TABLE + indexes only. No DROP, no ALTER, no
--     row/column mutation.  Owner applies to prod after review.
--   • RLS: authenticated-only (owner-only data); anon-none.
--   • Ships behind NEXT_PUBLIC_INVOICES_QBO_ENABLED (off in prod until flipped).

CREATE TABLE IF NOT EXISTS public.qbo_push_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The invoice being pushed.  uuid matches invoices.id.
  invoice_id      uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- Lifecycle state of this particular attempt.
  --   queued           → created; waiting for (or actively running) the push
  --   succeeded        → bill created (or adopted) in QBO; final positive state
  --   failed_transient → 429/5xx; next_retry_at set; drain will re-attempt
  --   failed_permanent → 4xx (not 429) or data error; no auto-retry; alert user
  --   retried          → superseded by a later attempt; historical record only
  status          text NOT NULL CHECK (status IN (
                    'queued',
                    'succeeded',
                    'failed_transient',
                    'failed_permanent',
                    'retried'
                  )),

  -- QBO Bill id returned on success (null until a bill is adopted or created).
  qbo_bill_id     text,

  -- The stripped request body POSTed to QBO (underscore-prefixed bookkeeping
  -- removed by stripInternalFields before logging, so no internal data leaks).
  request_body    jsonb,

  -- The raw JSON response from QBO (null on network error or before execution).
  response_body   jsonb,

  -- Human-readable error message (null on success).
  error_message   text,

  -- HTTP status code returned by QBO (null on network error or not-yet-run).
  http_status     integer,

  -- Which attempt number this is (0 = first push; 1 = first retry; 2 = second…).
  retry_count     integer NOT NULL DEFAULT 0,

  -- When to run the next retry (null for first attempts and terminal states).
  -- Exponential backoff: 30 s × 2^retry_count, capped at 4 h.
  next_retry_at   timestamptz,

  -- The authenticated user who triggered the push (null when triggered by cron).
  pushed_by       text,

  -- QBO company + environment for traceability.
  realm_id        text,
  environment     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Audit log query: all attempts for a given invoice, newest first.
CREATE INDEX IF NOT EXISTS qbo_push_attempts_invoice_idx
  ON public.qbo_push_attempts (invoice_id, created_at DESC);

-- Retry-queue drain: quickly find all transient failures ready to re-attempt.
CREATE INDEX IF NOT EXISTS qbo_push_attempts_queue_idx
  ON public.qbo_push_attempts (next_retry_at)
  WHERE status = 'failed_transient' AND next_retry_at IS NOT NULL;

COMMENT ON TABLE public.qbo_push_attempts IS
  'Audit log and retry queue for QBO Bill push attempts (QBO S9, issue #155). '
  'One row per attempt; retries create a new row with retry_count + 1. '
  'failed_transient rows with next_retry_at <= now() are eligible for the drain '
  'endpoint (/api/invoices/qbo/retry-queue); the total-mismatch guard lives in '
  'qboBillPush.ts (pure function, no migration needed).';

-- RLS: owner-only; anonymous sessions (client portal) see nothing.
ALTER TABLE public.qbo_push_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY qbo_push_attempts_authenticated_all
  ON public.qbo_push_attempts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY qbo_push_attempts_anon_none
  ON public.qbo_push_attempts
  FOR ALL TO anon USING (false);
