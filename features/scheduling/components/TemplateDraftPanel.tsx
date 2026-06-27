"use client";

import { CalendarClock } from "lucide-react";
import { MILESTONE_STAGES, type Job, type MilestoneStage } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { schedulingEnabled } from "../lib/featureFlag";
import { draftScheduleFromTemplate, TEMPLATE_PHASE_DURATIONS } from "../lib/templateSchedule";

/**
 * Compact schedule preview for /jobs/new (full mode). Shows the default phase
 * durations + projected target dates for the selected Job template BEFORE the
 * job is created. Renders nothing unless SCHEDULING_ENABLED is on.
 *
 * S4 (issue #92): auto-draft schedule from template. The parent page uses
 * `draftScheduleFromTemplate` (the same underlying function) to populate the job
 * row's `phase_target_dates`, `internal_target_date`, and `buffer_days` on save.
 * This component makes that pre-fill visible so Andrew can see what he's
 * committing to before he hits "Create project".
 */
export function TemplateDraftPanel({
  template,
  startDate,
}: {
  template: Job["template"];
  startDate: string;
}) {
  if (!schedulingEnabled()) return null;

  const draft = draftScheduleFromTemplate(template, startDate);
  const durations = TEMPLATE_PHASE_DURATIONS[template];

  return (
    <div
      data-testid="template-draft-panel"
      data-template={template}
      className="mt-1 rounded-lg border border-border bg-surface-muted/60 p-3"
      aria-label="Schedule preview"
    >
      <div className="flex items-center gap-1.5 text-xs text-text-secondary mb-2.5 font-medium">
        <CalendarClock className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        <span>Estimated schedule</span>
        <span className="ml-auto text-text-tertiary tabular-nums">
          {draft.bufferDays}d buffer
        </span>
      </div>

      <ol className="space-y-1" aria-label="Phase target dates">
        {MILESTONE_STAGES.map(({ key, label }) => {
          const days = durations[key as MilestoneStage];
          const target = draft.phaseTargetDates[key as MilestoneStage];
          const isSkipped = days === 0;
          return (
            <li
              key={key}
              data-testid={`draft-phase-${key}`}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className={isSkipped ? "text-text-tertiary" : "text-text-secondary"}>
                {label}
                {isSkipped && " (skipped)"}
              </span>
              <span
                className={
                  isSkipped
                    ? "text-text-tertiary tabular-nums"
                    : "text-text-primary tabular-nums font-medium"
                }
              >
                {isSkipped ? "—" : formatDate(target)}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5 pt-2 border-t border-border flex items-baseline justify-between text-xs">
        <span className="text-text-tertiary">Internal finish</span>
        <span
          data-testid="draft-internal-target"
          className="text-text-primary font-medium tabular-nums"
        >
          {formatDate(draft.internalTargetDate)}
        </span>
      </div>
    </div>
  );
}
