"use client";

import { Info } from "lucide-react";
import { schedulingEnabled } from "../lib/featureFlag";
import { phaseTargetPaceStatus, phaseBottleneckAdvisory } from "../lib/shopFloor";
import type { MilestoneStage } from "@shared/lib/types";

type JobSummary = {
  id: string;
  name: string;
  currentMilestone: MilestoneStage;
  currentMilestoneLabel: string;
  phaseTargetDates?: Partial<Record<MilestoneStage, string>> | null;
};

/**
 * Derives the single most-critical advisory from the active jobs on the board:
 * the behind job whose current phase has passed its target date the longest.
 * Returns null when all jobs are on pace (nothing to flag).
 */
function mostCriticalAdvisory(jobs: JobSummary[], today: Date): string | null {
  let worst: { days: number; name: string; phaseLabel: string } | null = null;

  for (const job of jobs) {
    const target = job.phaseTargetDates?.[job.currentMilestone];
    if (!target) continue;
    const pace = phaseTargetPaceStatus(target, today);
    if (pace !== "behind") continue;

    // daysUntil returns negative for past dates; most negative = most overdue.
    const overdueDays = new Date(today).getTime() - new Date(`${target}T00:00:00.000Z`).getTime();
    if (!worst || overdueDays > worst.days) {
      worst = { days: overdueDays, name: job.name, phaseLabel: job.currentMilestoneLabel };
    }
  }

  if (!worst) return null;
  return phaseBottleneckAdvisory(worst.name, worst.phaseLabel, "behind");
}

/**
 * Advisory-only banner on the status board. Surfaces the most critical
 * behind-schedule job/phase as a WIP-pileup advisory. Never blocks the crew —
 * the board and all controls work exactly as before with or without the banner.
 */
export function BoardAdvisoryBanner({
  jobs,
  today = new Date(),
}: {
  jobs: JobSummary[];
  today?: Date;
}) {
  if (!schedulingEnabled()) return null;

  const message = mostCriticalAdvisory(jobs, today);
  if (!message) return null;

  return (
    <div
      data-testid="board-advisory-banner"
      role="note"
      aria-live="polite"
      className="mx-4 mb-4 flex items-start gap-3 rounded-xl border border-status-at-risk-soft bg-status-at-risk-soft/40 px-4 py-3"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-status-at-risk"
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="text-sm text-text-primary">{message}</p>
    </div>
  );
}
