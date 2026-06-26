import type { Phase, TrackableItem } from "./types";

// Per-phase progress: done ÷ total items in that phase.
// Returns 0 when no items exist for the phase — a phase with no steps is
// not "fully done" by definition; it has no signal yet.
export function phaseProgress(items: TrackableItem[], phase: Phase): number {
  const phaseItems = items.filter((i) => i.phase === phase);
  if (phaseItems.length === 0) return 0;
  return phaseItems.filter((i) => i.done).length / phaseItems.length;
}

// Job-level progress: done ÷ total across all phases. Returns 0 for empty.
export function jobProgress(items: TrackableItem[]): number {
  if (items.length === 0) return 0;
  return items.filter((i) => i.done).length / items.length;
}
