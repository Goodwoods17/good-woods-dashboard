// Pure presentational — no hooks, no "use client" needed.
// Renders one horizontal bar per phase for the Budget-vs-Actual tab (P4, Task 6).
// Fill = actual spend; tick marks = budget; colour by over/under budget.

import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { BvaResult, PhaseRollup } from "@features/job-costing/lib/budgetVsActual";

function PhaseBar({ phase, scaleMax }: { phase: PhaseRollup; scaleMax: number }) {
  // Guard: when scaleMax is 0 (all-zero job) render a flat empty track.
  const fillPct = scaleMax > 0 ? Math.min((phase.actual / scaleMax) * 100, 100) : 0;
  const tickPct = scaleMax > 0 ? Math.min((phase.budget / scaleMax) * 100, 100) : 0;
  const overBudget = phase.actual > phase.budget;

  return (
    <div className="flex items-center gap-3">
      {/* Phase label — fixed width so bars line up */}
      <span className="w-28 shrink-0 truncate text-xs font-medium text-text-secondary">
        {phase.label}
      </span>

      {/* Bar track */}
      <div className="relative flex-1 h-2 rounded-full bg-surface-muted overflow-visible">
        {/* Actual fill */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-fast",
            overBudget ? "bg-status-blocked" : "bg-status-on-track"
          )}
          style={{ width: `${fillPct}%` }}
        />

        {/* Budget tick — thin vertical line; positioned via left offset */}
        {tickPct > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-px h-4 bg-text-tertiary rounded-full z-10"
            style={{ left: `${tickPct}%` }}
            aria-hidden
          />
        )}
      </div>

      {/* Actual / Budget figures */}
      <div className="shrink-0 text-right tabular-nums text-xs">
        <span
          className={cn("font-medium", overBudget ? "text-status-blocked" : "text-text-primary")}
        >
          {formatCAD(phase.actual)}
        </span>
        <span className="text-text-tertiary"> / {formatCAD(phase.budget)}</span>
      </div>
    </div>
  );
}

export function PhaseBarsView({ bva }: { bva: BvaResult }) {
  // Scale all bars to the same reference so widths are comparable across phases.
  let scaleMax = 0;
  for (const phase of bva.phases) {
    const phaseMax = phase.actual > phase.budget ? phase.actual : phase.budget;
    if (phaseMax > scaleMax) scaleMax = phaseMax;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Phase Spend</h2>

      <div className="space-y-3">
        {bva.phases.map((phase) => (
          <PhaseBar key={phase.phaseId} phase={phase} scaleMax={scaleMax} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1 text-[10px] text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 rounded-full bg-status-on-track" />
          Under budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 rounded-full bg-status-blocked" />
          Over budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-px h-3 bg-text-tertiary" />
          Budget
        </span>
      </div>
    </div>
  );
}
