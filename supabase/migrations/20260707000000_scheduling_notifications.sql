-- S22: scheduling_notifications — outbound notification queue + send log.
-- Stores approval-required drafts (pending_approval → approved → sent) and
-- auto-sent logistics reminders (auto_sent). Provides the server-side data for
-- per-client/day cap, debounce, and quiet-hours checks.
--
-- job_id matches jobs.id which is text (see the jobs table).
-- recipient_contact_id references contacts.id which is uuid.
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod until flag flipped).

CREATE TABLE IF NOT EXISTS public.scheduling_notifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The job this notification relates to.
  job_id                text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Kind: 'recommit' | 'date_change' | 'client_nudge' | 'kickoff' | 'logistics_reminder'.
  -- Validated in TypeScript (NotificationKind); stored as text to allow
  -- additions without a migration.
  kind                  text NOT NULL,

  -- The payer/contact this message is addressed to (nullable — kept as an
  -- optional link for budget rollup; email is captured at send time).
  recipient_contact_id  uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  -- Denormalized recipient email stored only at the point the owner approves +
  -- sends — not before, so there's no stale email from an old contact record.
  recipient_email       text,

  subject               text NOT NULL,
  body                  text NOT NULL,

  -- Lifecycle:
  --   'pending_approval' — composed, awaiting owner click
  --   'approved'         — owner clicked approve; enqueued for delivery
  --   'sent'             — delivered via Resend (approval-required path)
  --   'auto_sent'        — delivered automatically (logistics_reminder only)
  --   'cancelled'        — owner dismissed / superseded
  status                text NOT NULL DEFAULT 'pending_approval',

  -- Set by the Resend route on successful delivery.
  sent_at               timestamptz,
  resend_email_id       text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  -- The authenticated user who created or approved the notification.
  created_by            text
);

COMMENT ON TABLE public.scheduling_notifications IS
  'Outbound client notification queue for the Scheduling feature (S22). '
  'Approval-required drafts sit at pending_approval until the owner clicks '
  'Send; logistics reminders go straight to auto_sent. Provides the data for '
  'per-client/day cap + debounce checks.';

-- Index for per-client/day budget check (scanned on every send attempt).
CREATE INDEX IF NOT EXISTS scheduling_notifications_recipient_sent_at_idx
  ON public.scheduling_notifications (recipient_contact_id, sent_at)
  WHERE status IN ('sent', 'auto_sent');

-- Index for per-job debounce check.
CREATE INDEX IF NOT EXISTS scheduling_notifications_job_kind_sent_at_idx
  ON public.scheduling_notifications (job_id, kind, sent_at)
  WHERE status IN ('sent', 'auto_sent');

-- RLS: authenticated users can see and manage notifications for their shop;
-- anonymous (client portal) sees nothing — notifications are owner-only.
ALTER TABLE public.scheduling_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduling_notifications_authenticated_all ON public.scheduling_notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY scheduling_notifications_anon_none ON public.scheduling_notifications
  FOR ALL TO anon USING (false);
