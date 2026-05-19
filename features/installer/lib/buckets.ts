import type { Job } from "@shared/lib/types";

export type InstallBucket = "today" | "this_week" | "later" | "past";

export type InstallGroups = Record<InstallBucket, Job[]>;

// Bucket a job by its install date relative to today:
//   today      → installDate is today
//   this_week  → 1–7 days out
//   later      → more than 7 days out
//   past       → install date passed but not marked complete
export function bucket(job: Job, today: Date): InstallBucket {
  const install = new Date(job.installDate + "T12:00:00");
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (install.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "today";
  if (diffDays > 0 && diffDays <= 7) return "this_week";
  if (diffDays > 7) return "later";
  return "past";
}

export function groupByInstallBucket(jobs: Job[], today: Date): InstallGroups {
  const result: InstallGroups = {
    today: [],
    this_week: [],
    later: [],
    past: [],
  };
  for (const j of jobs) {
    if (j.pipelineStatus === "complete") continue;
    result[bucket(j, today)].push(j);
  }
  Object.values(result).forEach((arr) =>
    arr.sort((a, b) => a.installDate.localeCompare(b.installDate))
  );
  return result;
}
