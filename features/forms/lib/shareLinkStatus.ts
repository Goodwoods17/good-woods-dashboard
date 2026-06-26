import type { FormShareLink } from "@shared/lib/types";

/**
 * The owner-facing status of a share link, derived entirely from the *_at
 * timestamps. Pure (no React, no Supabase) so S3 can import and reuse it
 * without pulling in the share panel.
 *
 * Status contract (issue #41, extended by S3 #42 with the "started" state):
 *   sentAt=null                   → draft  (minted, not yet shared)
 *   sentAt set, viewed=null       → sent
 *   sentAt + viewed, no start/sub → opened
 *   startedAt set, no submit      → started (recipient saved at least once)
 *   submittedAt set               → submitted (earlier stamps irrelevant)
 *   revokedAt set                 → revoked   (always checked first)
 */
export type ShareLinkStatus = "draft" | "sent" | "opened" | "started" | "submitted" | "revoked";

export function shareLinkStatus(link: FormShareLink): ShareLinkStatus {
  if (link.revokedAt !== null) return "revoked";
  if (link.submittedAt !== null) return "submitted";
  if (link.startedAt !== null) return "started";
  if (link.sentAt === null) return "draft";
  if (link.viewedAt === null) return "sent";
  return "opened";
}

const STATUS_LABELS: Record<ShareLinkStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  opened: "Opened",
  started: "Started",
  submitted: "Submitted",
  revoked: "Revoked",
};

export function shareLinkStatusLabel(status: ShareLinkStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Stamp sentAt on a link the first time an owner performs a share action
 * (copy link, open mail/SMS draft). Idempotent: never overwrites an existing
 * sentAt. Returns a new object — never mutates.
 */
export function stampSentAt(link: FormShareLink): FormShareLink {
  if (link.sentAt !== null) return link;
  return { ...link, sentAt: new Date().toISOString() };
}
