import type { FormShareLink } from "@shared/lib/types";
import { shareLinkStatus, type ShareLinkStatus } from "./shareLinkStatus";

/**
 * Owner-only recipient-tracking model for a share link (Forms P2 · Slice 3,
 * issue #42). Pure (no React, no Supabase) so it is unit-testable under the node
 * vitest env and reusable by the SharePanel without pulling in any UI.
 *
 * Andrew's explicit ask: show the SENT date + a "N days ago" counter + the
 * OPENED date per recipient. These are owner-private — they never render on the
 * public /f/<token> page.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole calendar-ish days between two instants (floored, never negative). */
function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso).getTime();
  const diff = now.getTime() - from;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * A human "days since" label for a timestamp: "Today" / "1 day ago" /
 * "N days ago". Returns null for a null timestamp so callers can omit the line.
 * A future timestamp (clock skew) reads as "Today", never a negative count.
 */
export function daysSinceLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const days = daysBetween(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export type ShareLinkTracking = {
  status: ShareLinkStatus;
  /** Raw ISO timestamps, passed through for the owner surface to format. */
  sentAt: string | null;
  viewedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  /** The "N days ago" counter for the sent date (null until sent). */
  daysSinceSent: string | null;
  /** Owner-visible completion %, 0..100, or null before any save. */
  progress: number | null;
};

/** Build the owner-only tracking model from a raw share link. */
export function shareLinkTracking(link: FormShareLink, now: Date = new Date()): ShareLinkTracking {
  return {
    status: shareLinkStatus(link),
    sentAt: link.sentAt,
    viewedAt: link.viewedAt,
    startedAt: link.startedAt,
    submittedAt: link.submittedAt,
    daysSinceSent: daysSinceLabel(link.sentAt, now),
    progress: typeof link.progress === "number" ? link.progress : null,
  };
}
