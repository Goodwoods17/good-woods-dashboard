// Pure presentational — no hooks, no "use client" needed.
// Renders the Sold→Install phase lane for the Budget-vs-Actual tab (P4, Task 5).

import type { Job } from "@shared/lib/types";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { BvaResult, PhaseRollup } from "@features/job-costing/lib/budgetVsActual";
import { PHASE_ORDER } from "@features/job-costing/lib/costCodes";

export function TimelineView({ bva, job }: { bva: BvaResult; job: Job }) {
  // bva.phases is already PHASE_ORDER-ordered, but we filter by PHASE_ORDER to
  // guarantee order and exclude any orphan phases that have no budget.
  const phaseMap = new Map<string, PhaseRollup>(bva.phases.map((p) => [p.phaseId, p]));
  const ordered = (PHASE_ORDER as string[])
    .map((id) => phaseMap.get(id))
    .filter((p): p is PhaseRollup => p !== undefined);

  return (
    <div className="space-y-4">
      <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Phase Timeline</h2>

      {/* Lane — flex-wrap so it reflows gracefully on narrow viewports */}
      <div className="flex flex-wrap items-start gap-0">
        {ordered.map((phase, idx) => {
          const isLast = idx === ordered.length - 1;
          const isCurrent = phase.phaseId === job.currentMilestone;

          return (
            <div key={phase.phaseId} className="flex items-start">
              {/* Node + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
                {/* Variance chip (completed phases only) */}
                <div className="h-5 flex items-center justify-center">
                  {phase.complete ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
                        phase.variance <= 0
                          ? "bg-status-on-track-soft text-status-on-track"
                          : "bg-status-blocked-soft text-status-blocked"
                      )}
                    >
                      {formatCAD(phase.variance)}
                    </span>
                  ) : (
                    // Quiet budget figure for open phases
                    <span className="text-[10px] text-text-tertiary tabular-nums">
                      {formatCAD(phase.budget)}
                    </span>
                  )}
                </div>

                {/* Dot */}
                <div
                  className={cn(
                    "relative flex items-center justify-center rounded-full transition-colors",
                    phase.complete
                      ? "w-4 h-4 bg-accent"
                      : isCurrent
                        ? "w-4 h-4 bg-surface border-2 border-accent ring-2 ring-accent/30"
                        : "w-4 h-4 bg-surface-muted border-2 border-border"
                  )}
                >
                  {/* Inner fill for current node */}
                  {isCurrent && <div className="w-2 h-2 rounded-full bg-accent" />}
                </div>

                {/* Phase label */}
                <span
                  className={cn(
                    "text-[11px] text-center leading-tight px-1",
                    isCurrent
                      ? "font-semibold text-text-primary"
                      : phase.complete
                        ? "text-text-secondary"
                        : "text-text-tertiary"
                  )}
                >
                  {phase.label}
                </span>

                {/* "You are here" badge */}
                {isCurrent && <span className="text-[10px] font-medium text-accent">Now</span>}
              </div>

              {/* Connector line — omit after the last node */}
              {!isLast && (
                <div className="mt-[26px] flex-1 min-w-[16px] h-px bg-border self-start" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
