import { cn } from "@/lib/utils";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/types";

const TONES: Record<
  HealthStatus,
  { bg: string; text: string; dot: string }
> = {
  on_track: {
    bg: "bg-status-on-track-soft",
    text: "text-status-on-track",
    dot: "bg-status-on-track",
  },
  at_risk: {
    bg: "bg-status-at-risk-soft",
    text: "text-status-at-risk",
    dot: "bg-status-at-risk",
  },
  blocked: {
    bg: "bg-status-blocked-soft",
    text: "text-status-blocked",
    dot: "bg-status-blocked",
  },
  complete: {
    bg: "bg-secondary-soft",
    text: "text-status-complete",
    dot: "bg-status-complete",
  },
  paused: {
    bg: "bg-surface-muted",
    text: "text-status-paused",
    dot: "bg-status-paused",
  },
};

export function HealthPill({
  status,
  size = "sm",
}: {
  status: HealthStatus;
  size?: "sm" | "md";
}) {
  const tone = TONES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        tone.bg,
        tone.text,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {HEALTH_LABELS[status]}
    </span>
  );
}
