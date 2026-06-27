"use client";

import { CalendarClock } from "lucide-react";
import type { Job } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { schedulingEnabled } from "../lib/featureFlag";
import { buildScheduleOverview } from "../lib/scheduleOverview";

/**
 * Compact schedule-health widget for the Overview tab (S7, issue #95).
 * Shows status pill, committed install date, internal target, and buffer at a glance.
 * Renders nothing when SCHEDULING_ENABLED is off so the Overview tab is unaffected
 * in prod until the flag is flipped.
 */
export function ScheduleHealthWidget({ job }: { job: Job }) {
  if (!schedulingEnabled()) return null;

  const overview = buildScheduleOverview(job, new Date());

  return (
    <section
      data-testid="schedule-health-widget"
      aria-label="Schedule health summary"
      className="bg-surface rounded-xl shadow-resting p-4 flex flex-wrap items-center gap-4"
    >
      <div className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary shrink-0">
        <CalendarClock className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
        Schedule
      </div>

      <span
        data-testid="schedule-health-status"
        data-status={overview.status}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium",
          overview.status === "behind"
            ? "bg-status-blocked-soft text-status-blocked"
            : "bg-status-on-track-soft text-status-on-track"
        )}
      >
        {overview.status === "behind" ? "Behind" : "On track"}
      </span>

      <span className="text-xs text-text-secondary tabular-nums">
        Install{" "}
        <span className="font-medium text-text-primary">
          {formatDate(overview.committedInstall)}
        </span>
      </span>

      {overview.internalTarget && (
        <span className="text-xs text-text-secondary tabular-nums">
          Internal target{" "}
          <span className="font-medium text-text-primary">
            {formatDate(overview.internalTarget)}
          </span>
        </span>
      )}

      <span className="text-xs text-text-secondary tabular-nums">
        Buffer <span className="font-medium text-text-primary">{overview.bufferDays}d</span>
      </span>

      <span className="text-xs text-text-tertiary tabular-nums">
        {overview.phasesComplete}/{overview.phasesTotal} phases done
      </span>
    </section>
  );
}
