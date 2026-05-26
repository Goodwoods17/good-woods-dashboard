import { cn } from "@shared/lib/utils";

/**
 * Clay-soft chip with a mono day count for stale anchor relationships.
 * Locked from /impeccable craft review P0 #3: amber would have hijacked
 * the at-risk semantic axis; clay-soft is on-brand for the workshop and
 * one of the few places clay earns a full-saturation surface under the
 * Rare-Accent Rule.
 *
 * Renders only for anchors past the staleness threshold. Below the
 * threshold (or for non-anchors), returns null so the column reads
 * empty rather than green.
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
  if (daysSinceTouch < STALE_THRESHOLD_DAYS) return null;
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
