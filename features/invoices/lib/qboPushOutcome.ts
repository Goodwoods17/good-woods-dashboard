/**
 * Pure, I/O-free presentation helpers for QBO-H7 — push-outcome visibility
 * (issue #190). No Supabase, no QBO API, no React.
 *
 * Two silent gaps this closes:
 *   (a) Attachment failure — a Bill can push successfully while the source PDF
 *       fails to attach. `attachmentWarning` derives the amber "Bill sent, PDF
 *       didn't attach" copy from the non-blocking attachment result so the owner
 *       never assumes the document is in QuickBooks when it isn't.
 *   (b) Failed / retry-pending pushes — a `failed_transient` attempt leaves the
 *       invoice unlinked, so the panel showed "Not sent" identically to a
 *       never-attempted invoice. `pushHistoryBadge` distils the latest attempt
 *       into a distinct "Failed — will retry" / "Failed — needs attention" /
 *       "Sending…" state.
 */
import type { LatestPushAttempt } from "./qboPushAudit";

/**
 * The non-blocking attachment outcome, narrowed to what the UI needs. Mirrors
 * `AttachmentResult` from `qboAttachableServer` (server-only) without importing
 * it, so this module stays free of server dependencies.
 */
export type AttachmentOutcome =
  | { status: "attached"; attachableId?: string }
  | { status: "skipped"; reason?: string }
  | { status: "error"; message?: string };

/** True only when the PDF is genuinely in QuickBooks. */
export function attachmentAttached(attachment: AttachmentOutcome | null | undefined): boolean {
  return attachment?.status === "attached";
}

/**
 * Amber warning copy when a Bill pushed but its PDF did NOT attach (status is
 * "skipped" or "error"); null when attached (or no attachment info). The Bill
 * itself is fine — only the document is missing, so the owner can retry just
 * the attachment without re-pushing the Bill.
 */
export function attachmentWarning(attachment: AttachmentOutcome | null | undefined): string | null {
  if (!attachment || attachment.status === "attached") return null;
  return "Bill sent, but the PDF didn’t attach in QuickBooks.";
}

/** Distinct push-history states for an invoice that is NOT yet linked to a Bill. */
export type PushHistoryBadge =
  | { kind: "none" }
  | { kind: "queued"; label: string }
  | { kind: "failed_retry"; label: string; detail: string }
  | { kind: "failed_permanent"; label: string; detail: string };

const RETRY_DETAIL = "QuickBooks couldn’t be reached. It will retry automatically — or retry now.";
const PERMANENT_DETAIL = "This push was rejected by QuickBooks and won’t retry on its own.";

/**
 * Map the latest push attempt to a badge that distinguishes a failed /
 * retry-pending push from a never-attempted one.
 *
 * A linked invoice (`alreadyPushed`) is handled by the green "Sent" badge, so
 * this returns "none" for it; likewise a terminal `succeeded` / superseded
 * `retried` row (the live state is reflected elsewhere). Only genuinely
 * in-flight or failed-and-unlinked attempts produce a badge.
 */
export function pushHistoryBadge(args: {
  alreadyPushed: boolean;
  latest: LatestPushAttempt | null | undefined;
}): PushHistoryBadge {
  const { alreadyPushed, latest } = args;
  if (alreadyPushed || !latest) return { kind: "none" };

  switch (latest.status) {
    case "failed_transient":
      return {
        kind: "failed_retry",
        label: "Failed — will retry",
        detail: latest.errorMessage ?? RETRY_DETAIL,
      };
    case "failed_permanent":
      return {
        kind: "failed_permanent",
        label: "Failed — needs attention",
        detail: latest.errorMessage ?? PERMANENT_DETAIL,
      };
    case "queued":
      return { kind: "queued", label: "Sending to QuickBooks…" };
    default:
      // succeeded (without a link yet) or retried (superseded): no badge.
      return { kind: "none" };
  }
}
