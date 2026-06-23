// Pure presentational — no hooks, no "use client" needed.
// Answers "are we making money, and how much to claw back?" for the
// Budget-vs-Actual pace view (P4, Task 7).
//
// Two comparable bars:
//   Budget used    = (labour + materials actual) / (labour + materials budget)
//   Milestone progress = phase index / (total phases - 1)  →  0..1
//
// When budget-used % outruns milestone-progress %, the job is burning budget
// faster than it is advancing — immediately visible from the bar lengths.

import type { Job } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { formatCAD, formatPct } from "@shared/lib/format";
import { PHASE_ORDER } from "@features/job-costing/lib/costCodes";
import { marginTone } from "@features/job-costing/lib/budgetVsActual";
import type { BvaResult } from "@features/job-costing/lib/budgetVsActual";

// ── Tone chip mapping (identical to BudgetVsActualTab header) ─────────────────

const TONE_CHIP: Record<ReturnType<typeof marginTone>, string> = {
  on_track: "bg-status-on-track-soft text-status-on-track",
  at_risk: "bg-status-at-risk-soft text-status-at-risk",
  blocked: "bg-status-blocked-soft text-status-blocked",
};

const TONE_LABEL: Record<ReturnType<typeof marginTone>, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function LabelledBar({
  label,
  pct,
  fillClass,
}: {
  label: string;
  pct: number; // 0–100, already clamped
  fillClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className="text-xs tabular-nums text-text-secondary">{formatPct(pct)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-fast", fillClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PaceMarginView({ bva, job }: { bva: BvaResult; job: Job }) {
  // Budget used — combined labour + materials, guarded against zero denominator
  const totalBudget = bva.totalLabourBudget + bva.other.materials.budget;
  const totalActual = bva.totalLabourActual + bva.other.materials.actual;
  const rawBudgetUsed = totalBudget > 0 ? totalActual / totalBudget : 0;
  const budgetUsedPct = Math.min(Math.max(rawBudgetUsed * 100, 0), 100);

  // Milestone progress — 0 (design) → 1 (install), guarded for unknown milestone
  const phaseCount = PHASE_ORDER.length; // 6
  const milestoneIdx = PHASE_ORDER.indexOf(job.currentMilestone);
  const rawMilestoneProgress = milestoneIdx >= 0 ? milestoneIdx / (phaseCount - 1) : 0;
  const milestoneProgressPct = Math.min(Math.max(rawMilestoneProgress * 100, 0), 100);

  // Margin headline
  const tone = marginTone(bva.clawback, bva.budgetedMargin);

  // Pace read: budget running ahead of milestone means burning faster than advancing
  const paceDelta = budgetUsedPct - milestoneProgressPct;
  const paceLabel =
    paceDelta > 5
      ? "Budget running ahead of milestone — watch pace"
      : paceDelta < -5
        ? "Budget well inside milestone — good pace"
        : "Budget and milestone in step";

  return (
    <div className="space-y-6">
      <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Pace</h2>

      {/* Dual bars */}
      <div className="space-y-4">
        <LabelledBar
          label="Budget used (labour + materials)"
          pct={budgetUsedPct}
          fillClass={paceDelta > 5 ? "bg-status-at-risk" : "bg-accent"}
        />
        <LabelledBar
          label="Milestone progress"
          pct={milestoneProgressPct}
          fillClass="bg-status-on-track"
        />
      </div>

      {/* Pace interpretation note */}
      <p className="text-xs text-text-tertiary">{paceLabel}</p>

      {/* Margin headline */}
      <div className="border-t border-border pt-5 space-y-2">
        <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Margin</h2>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums text-text-primary">
            {formatCAD(bva.projectedMargin)}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              TONE_CHIP[tone]
            )}
          >
            {TONE_LABEL[tone]}
          </span>
        </div>

        {bva.clawback > 0 && (
          <p className="text-sm tabular-nums text-status-blocked">
            Clawback: {formatCAD(bva.clawback)}
          </p>
        )}
      </div>
    </div>
  );
}
