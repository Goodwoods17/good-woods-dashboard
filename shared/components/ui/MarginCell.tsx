import { cn } from "@shared/lib/utils";
import { formatPct } from "@shared/lib/format";
import type { Margin } from "@shared/lib/types";

const TONE: Record<Margin["band"], { dot: string; text: string; label: string }> = {
  on_track: {
    dot: "bg-status-on-track",
    text: "text-status-on-track",
    label: "Healthy",
  },
  at_risk: {
    dot: "bg-status-at-risk",
    text: "text-status-at-risk",
    label: "Tight",
  },
  blocked: {
    dot: "bg-status-blocked",
    text: "text-status-blocked",
    label: "Below floor",
  },
};

export function MarginCell({
  margin,
  showLabel = false,
}: {
  margin: Margin;
  showLabel?: boolean;
}) {
  const tone = TONE[margin.band];
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      <span className={cn("font-medium", tone.text)}>
        {formatPct(margin.marginPct)}
      </span>
      {showLabel && (
        <span className="text-xs text-text-tertiary">{tone.label}</span>
      )}
    </span>
  );
}
