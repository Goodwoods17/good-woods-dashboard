"use client";

import { cn } from "@shared/lib/utils";
import { schedulingEnabled } from "../lib/featureFlag";
import { phaseTargetLabel, phaseTargetPaceStatus } from "../lib/shopFloor";
import type { PaceStatus } from "../lib/shopFloor";

const PACE_STYLES: Record<PaceStatus, string> = {
  on_pace: "bg-status-on-track-soft text-status-on-track",
  due_today: "bg-status-at-risk-soft text-status-at-risk",
  behind: "bg-status-blocked-soft text-status-blocked",
};

/**
 * Compact badge that shows the phase's internal target date and pace status
 * inline in the phase-section header: "by Mon · 3d left · on pace".
 * Renders nothing when scheduling is disabled OR no target is set.
 */
export function PhaseTargetBadge({
  targetDate,
  today = new Date(),
  className,
}: {
  targetDate: string | null | undefined;
  today?: Date;
  className?: string;
}) {
  if (!schedulingEnabled() || !targetDate) return null;

  const pace = phaseTargetPaceStatus(targetDate, today);
  const label = phaseTargetLabel(targetDate, today);

  return (
    <span
      data-testid="phase-target-badge"
      data-pace={pace}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
        PACE_STYLES[pace],
        className
      )}
    >
      {label}
    </span>
  );
}
