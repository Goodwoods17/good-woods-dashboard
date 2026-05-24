import { cn } from "@shared/lib/utils";
import type { HealthStatus } from "@shared/lib/types";

const DOT_BY_HEALTH: Record<HealthStatus, string> = {
  on_track: "bg-status-on-track",
  at_risk: "bg-status-at-risk",
  blocked: "bg-status-blocked",
  complete: "bg-status-complete",
  paused: "bg-status-paused",
};

const SIZE_CLASS = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
} as const;

export function StatusDot({
  status,
  size = "md",
}: {
  status: HealthStatus;
  size?: keyof typeof SIZE_CLASS;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block rounded-full", SIZE_CLASS[size], DOT_BY_HEALTH[status])}
    />
  );
}
