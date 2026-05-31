import { cn } from "@shared/lib/utils";

/**
 * Warmth indicator for anchor relationships, with two registers:
 *
 * - Healthy (touched within the threshold): a quiet tertiary day count,
 *   no colour. This exists so the column never reads as broken when an
 *   anchor is simply fine. Crucially NOT green: the locked /impeccable
 *   contract rejected green here, so "healthy" is neutral, not sage.
 * - Stale (past the threshold): clay-soft chip with a mono day count.
 *   Locked from /impeccable craft review P0 #3: amber would have hijacked
 *   the at-risk semantic axis; clay-soft is on-brand for the workshop and
 *   one of the few places clay earns a full-saturation surface under the
 *   Rare-Accent Rule.
 *
 * Non-anchors return null (warmth is only tracked for anchors), as does
 * an anchor with no touch on record (unknown, not healthy).
 */

export const STALE_THRESHOLD_DAYS = 30;

export function WarmthChip({
  isAnchor,
  daysSinceTouch,
}: {
  isAnchor: boolean;
  daysSinceTouch: number | null;
}) {
  if (!isAnchor) return null;
  if (daysSinceTouch === null) return null;

  if (daysSinceTouch < STALE_THRESHOLD_DAYS) {
    return (
      <span
        className="font-mono tabular-nums text-xs text-text-tertiary"
        title={`${daysSinceTouch} days since last touch`}
      >
        {daysSinceTouch}d
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "bg-accent-soft text-accent font-medium"
      )}
      title={`${daysSinceTouch} days since last touch`}
    >
      <span className="font-mono tabular-nums text-xs">{daysSinceTouch}</span>
      <span className="text-[11px] uppercase tracking-[0.06em]">days</span>
    </span>
  );
}
