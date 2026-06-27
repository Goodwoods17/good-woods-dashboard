import { DONE } from "@features/drawings/lib/pipelines";
import type { JobPiece } from "@shared/lib/types";
import { isJobItemDone } from "./statusCycle";
import type { JobItem, Phase, TrackableItem } from "./types";

// Pure read-layer adapter: maps job_items → TrackableItem[] with normalised
// `done` flag for progress math. Drawings pieces are merged via
// piecesToTrackableItems (slice 4) — the TrackableItem interface is unchanged.
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

// Slice 4: which phase a piece belongs to for the unified progress view.
// Pieces that have reached install-phase statuses move to the 'install' section;
// everything else (including not_started and all production stages) belongs to
// 'delivery' — where the crew tracks packing and dispatch.
const INSTALL_STATUSES = new Set(["installed", "final_adjustments", "done"]);

export function pieceToPhase(status: string): Phase {
  return INSTALL_STATUSES.has(status) ? "install" : "delivery";
}

// Slice 4: A piece is "done" at the terminal status from pipelines.ts
// (the string constant "done"). Using the constant makes it resilient to any
// future pipeline change and keeps the rule in one place.
export function isPieceDone(status: string): boolean {
  return status === DONE;
}

// Slice 4: maps Drawings pieces → TrackableItem[] so the unified progress math
// (phaseProgress / jobProgress) can include delivery/install pieces alongside
// job_items without duplicating the data. Pieces stay in their own table.
// Note: piece.projectId == jobId in this codebase (see DrawingsView.tsx).
export function piecesToTrackableItems(pieces: JobPiece[]): TrackableItem[] {
  return pieces.map((piece) => ({
    id: piece.id,
    jobId: piece.projectId,
    phase: pieceToPhase(piece.status),
    label: piece.label,
    done: isPieceDone(piece.status),
    kind: "piece" as const,
    sortOrder: piece.sortOrder,
  }));
}
