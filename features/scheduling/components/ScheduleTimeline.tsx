"use client";

import { CalendarClock } from "lucide-react";
import { MILESTONE_STAGES, type Job, type MilestoneStage } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { schedulingEnabled } from "../lib/featureFlag";
import {
  scheduleStatus,
  committedDate,
  bufferDaysFor,
  SCHEDULE_STATUS_LABELS,
} from "../lib/schedule";

/**
 * S1 tracer — a READ-ONLY 6-phase schedule timeline for a job. Shows each
 * phase's internal target date (when set), the frozen client-committed install
 * date, the pooled buffer, and a basic on-track / behind badge derived from the
 * current-milestone pointer. Editing, capacity-aware computation and buffer-burn
 * land in later slices. Renders nothing unless SCHEDULING_ENABLED is on.
 */
export function ScheduleTimeline({ job }: { job: Job }) {
  if (!schedulingEnabled()) return null;

  const currentIdx = MILESTONE_STAGES.findIndex((s) => s.key === job.currentMilestone);
  const targets = job.phaseTargetDates ?? null;
  const status = scheduleStatus(job.currentMilestone, targets, new Date());
  const buffer = bufferDaysFor(job);
  const committed = committedDate(job);

  const targetFor = (key: MilestoneStage) => targets?.[key] ?? null;

  return (
    <section
      data-testid="schedule-timeline"
      aria-label="Schedule timeline"
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          <CalendarClock className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
          Schedule
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary tabular-nums">
          <span>
            Committed install{" "}
            <span className="font-medium text-text-primary">{formatDate(committed)}</span>
          </span>
          <span>
            Buffer <span className="font-medium text-text-primary">{buffer}d</span>
          </span>
          <span
            data-testid="schedule-status-badge"
            data-status={status}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium",
              status === "behind"
                ? "bg-status-blocked-soft text-status-blocked"
                : "bg-status-on-track-soft text-status-on-track"
            )}
          >
            {SCHEDULE_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <ol className="flex items-stretch gap-0">
        {MILESTONE_STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isLast = idx === MILESTONE_STAGES.length - 1;
          const target = targetFor(stage.key);

          return (
            <li key={stage.key} className="flex items-start flex-1 last:flex-none">
              <div className="flex flex-col gap-1.5 shrink-0">
                <div
                  className={cn(
                    "h-6 w-6 rounded-full grid place-items-center text-xs font-medium border",
                    isPast && "bg-status-on-track border-status-on-track text-white",
                    isCurrent && "bg-white text-text-primary ring-2 ring-accent border-transparent",
                    !isPast && !isCurrent && "bg-surface border-border text-text-tertiary"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {idx + 1}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isCurrent ? "text-text-primary" : "text-text-secondary"
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-xs tabular-nums text-text-tertiary whitespace-nowrap">
                  {target ? formatDate(target) : "—"}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "h-px flex-1 mx-3 mt-3 transition-colors duration-base",
                    isPast ? "bg-status-on-track" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
