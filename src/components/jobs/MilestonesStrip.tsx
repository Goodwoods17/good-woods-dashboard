"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILESTONE_STAGES, type MilestoneStage } from "@/lib/types";

export function MilestonesStrip({
  current,
  onChange,
}: {
  current: MilestoneStage;
  onChange?: (stage: MilestoneStage) => void;
}) {
  const currentIdx = MILESTONE_STAGES.findIndex((s) => s.key === current);
  const interactive = !!onChange;

  return (
    <div className="flex items-center gap-0">
      {MILESTONE_STAGES.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isLast = idx === MILESTONE_STAGES.length - 1;

        const StepWrapper: React.ElementType = interactive ? "button" : "div";
        const stepProps = interactive
          ? {
              type: "button" as const,
              onClick: () => onChange?.(stage.key),
              "aria-label": `Set milestone to ${stage.label}`,
              className:
                "flex items-center gap-2 shrink-0 group rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft -m-1 p-1",
            }
          : { className: "flex items-center gap-2 shrink-0" };

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-none">
            <StepWrapper {...stepProps}>
              <div
                className={cn(
                  "h-6 w-6 rounded-full grid place-items-center text-xs font-medium border transition-colors duration-base",
                  isPast &&
                    "bg-status-on-track border-status-on-track text-white",
                  isCurrent &&
                    "bg-accent border-accent text-white shadow-sm",
                  !isPast &&
                    !isCurrent &&
                    "bg-surface border-border text-text-tertiary",
                  interactive && "group-hover:scale-110 transition-transform"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isPast ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCurrent && "text-text-primary",
                  isPast && "text-text-secondary",
                  !isPast && !isCurrent && "text-text-tertiary",
                  interactive && "group-hover:text-text-primary"
                )}
              >
                {stage.label}
              </span>
            </StepWrapper>
            {!isLast && (
              <div
                className={cn(
                  "h-px flex-1 mx-3 transition-colors duration-base",
                  isPast ? "bg-status-on-track" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
