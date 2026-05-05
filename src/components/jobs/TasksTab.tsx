"use client";

import { Check, Circle, ArrowRight } from "lucide-react";
import { MILESTONE_STAGES, type Job, type MilestoneStage } from "@/lib/types";
import { useJobs } from "@/lib/jobsStore";
import { cn } from "@/lib/utils";

const STAGE_HINTS: Record<MilestoneStage, string> = {
  sold: "Quote accepted, deposit captured, drawings signed off",
  materials: "Sheets, hardware, finish materials ordered + landed",
  cut: "Boxes / doors / drawer fronts cut and labelled",
  assemble: "Carcasses + drawers assembled, hardware bored",
  finish: "Spray, sand, top-coat — 100% cure before pack",
  install: "On site, scribed, levelled, hardware adjusted, walk-through",
};

export function TasksTab({ job }: { job: Job }) {
  const { updateJob } = useJobs();
  const currentIdx = MILESTONE_STAGES.findIndex(
    (s) => s.key === job.currentMilestone
  );

  function advanceTo(stage: MilestoneStage) {
    updateJob(job.id, { currentMilestone: stage });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <header className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">
          Build progress
        </h2>
        <p className="text-sm text-text-secondary">
          Tap a step to mark it done — the active milestone advances and an
          activity log entry is written automatically.
        </p>
      </header>

      <ol className="space-y-2">
        {MILESTONE_STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;

          return (
            <li key={stage.key}>
              <button
                onClick={() => advanceTo(stage.key)}
                className={cn(
                  "w-full text-left bg-surface border rounded-lg p-4 flex items-start gap-3 transition-all duration-fast",
                  isCurrent && "border-accent shadow-sm",
                  isPast && "border-border bg-surface-muted/40",
                  isFuture && "border-border hover:border-border-strong"
                )}
              >
                <div
                  className={cn(
                    "h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 transition-colors duration-fast",
                    isPast && "bg-status-on-track text-white",
                    isCurrent && "bg-accent text-white",
                    isFuture && "bg-surface border border-border text-text-tertiary"
                  )}
                >
                  {isPast ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : isCurrent ? (
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <Circle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isPast && "text-text-secondary",
                        isCurrent && "text-text-primary",
                        isFuture && "text-text-tertiary"
                      )}
                    >
                      {idx + 1}. {stage.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
                        Active
                      </span>
                    )}
                    {isPast && (
                      <span className="text-[10px] uppercase tracking-wider text-status-on-track">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                    {STAGE_HINTS[stage.key]}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="text-xs text-text-tertiary px-1">
        Custom checklists per job arrive in M4 alongside the SOPs module.
      </div>
    </div>
  );
}
