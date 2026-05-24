import { cn } from "@shared/lib/utils";
import { PIPELINE_LABELS, type PipelineStatus } from "@shared/lib/types";

// Pipeline is a *stage* axis, not a *health* axis. Keep the green/amber/red
// vocabulary reserved for HealthPill (spec §3.1: status colors are semantic-only).
// Three buckets, mapped to the warm clay/taupe/neutral ramps the spec defines:
//   - boundary stages (new, complete)     → neutral
//   - human-touch stages (sold, installing) → secondary taupe
//   - active making (design/prod/finish)   → accent clay
const TONES: Record<
  PipelineStatus,
  { bg: string; text: string; dot: string }
> = {
  new: {
    bg: "bg-surface-muted",
    text: "text-text-secondary",
    dot: "bg-text-tertiary",
  },
  sold: {
    bg: "bg-secondary-soft",
    text: "text-secondary",
    dot: "bg-secondary",
  },
  in_design: {
    bg: "bg-accent-soft",
    text: "text-accent",
    dot: "bg-accent",
  },
  in_production: {
    bg: "bg-accent-soft",
    text: "text-accent",
    dot: "bg-accent",
  },
  in_finishing: {
    bg: "bg-accent-soft",
    text: "text-accent",
    dot: "bg-accent-active",
  },
  installing: {
    bg: "bg-secondary-soft",
    text: "text-secondary-hover",
    dot: "bg-secondary-hover",
  },
  complete: {
    bg: "bg-surface-muted",
    text: "text-text-secondary",
    dot: "bg-text-tertiary",
  },
};

export function StatusBadge({ status }: { status: PipelineStatus }) {
  const tone = TONES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {PIPELINE_LABELS[status]}
    </span>
  );
}
