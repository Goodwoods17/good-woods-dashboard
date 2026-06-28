-- QBO S10 (issue #156): un-push / void path.
--
-- Records a void (guarded reversal) in the SAME audit trail as the push it
-- undoes, so an accountant reviewing a wrongly-pushed bill sees one timeline
-- per invoice: pushed → voided → (optionally) re-pushed.
--
-- We add a nullable-safe `kind` column to `qbo_push_attempts` distinguishing a
-- push attempt ('push', the existing meaning + default for all current rows)
-- from a void attempt ('void'). The existing `status` lifecycle is reused:
-- a successful void is logged 'succeeded', a failed one 'failed_transient' /
-- 'failed_permanent', exactly like a push.
--
-- ADDITIVE-ONLY: ADD COLUMN with a DEFAULT (existing rows backfill to 'push')
-- + a CHECK on the NEW column only. No DROP, no destructive ALTER of existing
-- columns/constraints, no row mutation. Owner applies to prod after review.
-- Ships behind NEXT_PUBLIC_INVOICES_QBO_ENABLED (off in prod until flipped).

ALTER TABLE public.qbo_push_attempts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'push'
  CHECK (kind IN ('push', 'void'));

COMMENT ON COLUMN public.qbo_push_attempts.kind IS
  'Which QBO Bill operation this attempt records: ''push'' (create, the default '
  'and meaning for every pre-S10 row) or ''void'' (guarded reversal — delete the '
  'wrongly-pushed Bill in QBO + clear the quickbooks_links row). QBO S10, #156.';
