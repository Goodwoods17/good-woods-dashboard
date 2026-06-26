import { isJobItemDone } from "./statusCycle";
import type { JobItem, TrackableItem } from "./types";

// Pure read-layer adapter: maps job_items → TrackableItem[] with normalised
// `done`. Drawings pieces (slice 4) will be folded in here at that time —
// the TrackableItem interface does not change when that happens.
export function toTrackableItems(items: JobItem[]): TrackableItem[] {
  return items.map((item) => ({
    id: item.id,
    jobId: item.jobId,
    phase: item.phase,
    label: item.label,
    done: isJobItemDone(item.status),
    kind: "job_item" as const,
    sortOrder: item.sortOrder,
  }));
}
