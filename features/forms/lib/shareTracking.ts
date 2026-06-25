import type { FormInstanceField, FormShareLink, RecipientStatus } from "@shared/lib/types";
import { getFieldEntry } from "./fieldRegistry";

/**
 * Pure (no React, no Supabase) owner-tracking helpers for the share-link
 * lifecycle. The /f/<token> path stamps the *_at columns server-side; the owner
 * surface derives a single status pill + a "N days ago" counter from them.
 * Kept pure so the funnel logic is unit-testable under the node vitest env.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The furthest lifecycle state this link has reached, derived from its stamps.
 * Strictly ordered submitted > started > opened > sent > created, so we test the
 * terminal stamps first — a later stamp implies the whole funnel even if an
 * earlier stamp is somehow absent.
 */
export function recipientStatus(link: FormShareLink): RecipientStatus {
  if (link.submittedAt !== null) return "submitted";
  if (link.startedAt !== null) return "started";
  if (link.viewedAt !== null) return "opened";
  if (link.sentAt !== null) return "sent";
  return "created";
}

const STATUS_LABELS: Record<RecipientStatus, string> = {
  created: "Created",
  sent: "Sent",
  opened: "Opened",
  started: "Started",
  submitted: "Submitted",
};

export function statusLabel(status: RecipientStatus): string {
  return STATUS_LABELS[status];
}

/** The ordered funnel, for rendering the full Sent → Opened → Started → Submitted pill track. */
export const RECIPIENT_STATUS_ORDER: RecipientStatus[] = ["sent", "opened", "started", "submitted"];

/**
 * Whole 24h windows elapsed since an ISO instant, clamped at 0 (a future instant
 * reads as 0, never negative). Null instant → null. `now` is injectable for tests.
 */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (iso === null) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = now.getTime() - then;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/** Human "today" / "1 day ago" / "N days ago"; empty string for a null instant. */
export function daysSinceLabel(iso: string | null, now: Date = new Date()): string {
  const n = daysSince(iso, now);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "1 day ago";
  return `${n} days ago`;
}

/**
 * Whether a single answerable field carries content. Independent of the registry
 * `required` flag (which lets optional blanks "pass") — progress reflects actual
 * fill, not the lock gate. A checkbox is answered when ticked; a media field when
 * a path is stored; everything else when its value is a non-empty string.
 */
function fieldIsAnswered(field: FormInstanceField): boolean {
  if (field.type === "checkbox") return field.checked === true;
  if (field.type === "photo" || field.type === "signature") {
    return typeof field.photoUrl === "string" && field.photoUrl.trim() !== "";
  }
  return typeof field.value === "string" && field.value.trim() !== "";
}

/**
 * Owner-visible completion %, 0..100 (rounded). Layout fields (sections) are
 * excluded from both numerator and denominator. Zero answerable fields → 0.
 */
export function computeProgress(fields: FormInstanceField[]): number {
  const answerable = fields.filter((f) => {
    const entry = getFieldEntry(f.type);
    // Unknown/future types are not layout → count them as answerable.
    return !entry?.isLayout;
  });
  if (answerable.length === 0) return 0;
  const answered = answerable.filter(fieldIsAnswered).length;
  return Math.round((answered / answerable.length) * 100);
}
