import type { HealthStatus, Job, JobBlocker, PipelineStatus } from "@shared/lib/types";

// Expected days-to-install that a job should still have when it enters each
// pipeline stage. If the actual days-to-install is less than the stage's lead
// time, the job is behind schedule for that stage.
//
// These are the same numbers VariantB_Schedule used; lifted from the prototype
// to a real lib so the dashboard's status dots derive from one rule.
const STAGE_LEAD_DAYS: Record<PipelineStatus, number> = {
  new: 60,
  sold: 45,
  in_design: 30,
  in_production: 21,
  in_finishing: 10,
  installing: 3,
  complete: 0,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function daysToInstall(installDate: string, today: Date = new Date()): number {
  return daysBetween(startOfDay(today), startOfDay(new Date(installDate)));
}

// Health is derived from install proximity vs. current pipeline stage.
// Two states stay user-controlled and bypass the rule:
//   - paused: explicit deliberate pause; time doesn't apply
//   - any job whose pipeline is "complete": health is "complete"
//
// Otherwise: if the job has less time-to-install than the stage expects,
// it's at_risk; if it has less than half the stage's lead time (or is overdue
// for a non-installing stage), it's blocked.
export function deriveHealth(
  job: Job,
  today: Date = new Date(),
  activeBlockers: JobBlocker[] = []
): HealthStatus {
  if (job.pipelineStatus === "complete") return "complete";
  if (job.healthStatus === "paused") return "paused";
  if (activeBlockers.length > 0) return "blocked";

  const expected = STAGE_LEAD_DAYS[job.pipelineStatus];
  const actual = daysToInstall(job.installDate, today);

  if (actual < 0 && job.pipelineStatus !== "installing") return "blocked";
  if (actual < expected / 2) return "blocked";
  if (actual < expected) return "at_risk";
  return "on_track";
}

export { STAGE_LEAD_DAYS };
