import { JOB_ITEM_STATUSES, type JobItemStatus } from "./types";

// Tap-to-cycle order for a job_item: not_started → in_progress → blocked → done
// → (wrap) not_started. Pure + unit-tested so the optimistic store and the UI
// never disagree on what a tap does.
const CYCLE: readonly JobItemStatus[] = JOB_ITEM_STATUSES;

export function nextStatus(current: JobItemStatus): JobItemStatus {
  const i = CYCLE.indexOf(current);
  // Unknown/unexpected value → start the cycle from the beginning (safe default).
  if (i === -1) return CYCLE[0];
  return CYCLE[(i + 1) % CYCLE.length];
}

// Kind-specific `done`-normalisation for a job_item: done only at status 'done'.
// (A Drawings piece normalises at its terminal status — folded in slice 4.)
export function isJobItemDone(status: JobItemStatus): boolean {
  return status === "done";
}
