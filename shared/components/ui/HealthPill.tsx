import { HEALTH_LABELS, type HealthStatus } from "@shared/lib/types";
import { Pill, type PillTone } from "@shared/components/ui/Pill";

// Health is the "is this OK?" axis: green/amber/red vocabulary, plus
// neutral states for complete (moss) and paused (gray). The Lean palette
// is semantic-only per spec §3.1 — never reuse these tones for non-status
// purposes.
const TONES: Record<HealthStatus, PillTone> = {
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
  return (
    <Pill
      tone={TONES[status]}
      label={HEALTH_LABELS[status]}
      shape="pill"
      size={size}
    />
  );
}
