/**
 * S22 — Row mapper for public.scheduling_notifications.
 * Converts between Postgres snake_case rows and the TS NotificationRecord shape.
 */
import type { NotificationKind } from "./notifications";

export const SCHEDULING_NOTIFICATIONS_TABLE = "scheduling_notifications";

/** A persisted notification from the DB. */
export type NotificationRecord = {
  id: string;
  jobId: string;
  kind: NotificationKind;
  recipientContactId: string | null;
  recipientEmail: string | null;
  subject: string;
  body: string;
  /** 'pending_approval' | 'approved' | 'sent' | 'auto_sent' | 'cancelled' */
  status: string;
  sentAt: string | null;
  resendEmailId: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type NotificationRow = {
  id: string;
  job_id: string;
  kind: string;
  recipient_contact_id: string | null;
  recipient_email: string | null;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  resend_email_id: string | null;
  created_at: string;
  created_by: string | null;
};

export function rowToNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    kind: row.kind as NotificationKind,
    recipientContactId: row.recipient_contact_id,
    recipientEmail: row.recipient_email,
    subject: row.subject,
    body: row.body,
    status: row.status,
    sentAt: row.sent_at,
    resendEmailId: row.resend_email_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function notificationToRow(
  n: Omit<NotificationRecord, "id" | "createdAt">
): Omit<NotificationRow, "id" | "created_at"> {
  return {
    job_id: n.jobId,
    kind: n.kind,
    recipient_contact_id: n.recipientContactId ?? null,
    recipient_email: n.recipientEmail ?? null,
    subject: n.subject,
    body: n.body,
    status: n.status,
    sent_at: n.sentAt ?? null,
    resend_email_id: n.resendEmailId ?? null,
    created_by: n.createdBy ?? null,
  };
}
