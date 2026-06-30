"use client";

import type { JobPiece, JobPiecePin } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DONE, NOT_STARTED } from "../lib/pipelines";

function tone(status: string): string {
  if (status === DONE) return "bg-status-complete";
  if (status === NOT_STARTED) return "bg-text-tertiary";
  if (status === "installed" || status === "final_adjustments") return "bg-status-on-track";
  return "bg-status-at-risk";
}

// S8b: position comes from the pin row (job_piece_pins); display from the piece.
export function PiecePin({
  pin, piece, selected, onSelect,
}: {
  pin: JobPiecePin;
  piece: JobPiece;
  selected: boolean;
  onSelect: () => void;
}) {
  if (pin.x == null || pin.y == null) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
      className={cn(
        "pointer-events-auto absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
        "text-[10px] font-semibold text-white shadow-floating duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        tone(piece.status),
        selected ? "ring-2 ring-accent ring-offset-1" : ""
      )}
      title={`${piece.code ?? piece.label} — ${piece.status}`}
      aria-label={`${piece.code ?? piece.label}, ${piece.status}`}
    >
      {(piece.code ?? piece.label).slice(0, 4)}
    </button>
  );
}
