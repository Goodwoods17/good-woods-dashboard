import type { PillTone } from "@shared/components/ui/Pill";
import type { JobItemStatus } from "./types";

/** Human label for each job_item status. */
export const JOB_ITEM_STATUS_LABELS: Record<JobItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** Pill tone per status (reuses the shared Pill tone vocabulary / tokens). */
export function jobItemStatusTone(status: JobItemStatus): PillTone {
  switch (status) {
    case "not_started":
      return { bg: "bg-surface-muted", text: "text-text-secondary", dot: "bg-text-tertiary" };
    case "in_progress":
      return { bg: "bg-accent-soft", text: "text-accent", dot: "bg-accent" };
    case "blocked":
      return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" };
    case "done":
      return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  }
}
