import type { Activity, ActivityKind, Job } from "./types";
import { HEALTH_LABELS, PIPELINE_LABELS } from "./types";

export const DEFAULT_ACTOR = "Andrew";

export function newActivity(
  kind: ActivityKind,
  message: string,
  actor: string = DEFAULT_ACTOR
): Activity {
  return {
    id: `a${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor,
    kind,
    message,
  };
}

export function appendActivity(job: Job, entry: Activity): Job {
  return { ...job, activity: [...(job.activity ?? []), entry] };
}

/**
 * Diff two job snapshots and emit activity entries for any
 * meaningful change. Used by the store to auto-log edits.
 */
export function diffActivity(prev: Job, next: Job): Activity[] {
  const events: Activity[] = [];

  if (prev.pipelineStatus !== next.pipelineStatus) {
    events.push(
      newActivity(
        "pipeline_changed",
        `Pipeline moved from ${PIPELINE_LABELS[prev.pipelineStatus]} to ${PIPELINE_LABELS[next.pipelineStatus]}`
      )
    );
  }
  if (prev.healthStatus !== next.healthStatus) {
    events.push(
      newActivity(
        "health_changed",
        `Health changed from ${HEALTH_LABELS[prev.healthStatus]} to ${HEALTH_LABELS[next.healthStatus]}`
      )
    );
  }
  if (prev.currentMilestone !== next.currentMilestone) {
    events.push(
      newActivity(
        "milestone_advanced",
        `Milestone advanced to ${next.currentMilestone}`
      )
    );
  }
  if (prev.revenue !== next.revenue) {
    events.push(
      newActivity(
        "revenue_edited",
        `Revenue updated to ${formatShort(next.revenue)}`
      )
    );
  }
  if (prev.costs !== next.costs) {
    const prevTotal = prev.costs.reduce((s, c) => s + c.amount, 0);
    const nextTotal = next.costs.reduce((s, c) => s + c.amount, 0);
    if (prevTotal !== nextTotal) {
      events.push(
        newActivity(
          "cost_edited",
          `Costs updated — total ${formatShort(prevTotal)} → ${formatShort(nextTotal)}`
        )
      );
    }
  }

  return events;
}

function formatShort(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}
