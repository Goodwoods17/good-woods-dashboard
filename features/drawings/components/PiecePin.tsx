"use client";

import type { JobPiece } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DONE, NOT_STARTED } from "../lib/pipelines";

function tone(status: string): string {
  if (status === DONE) return "bg-status-complete";
  if (status === NOT_STARTED) return "bg-text-tertiary";
  if (status === "installed" || status === "final_adjustments") return "bg-status-on-track";
  return "bg-status-at-risk";
}

export function PiecePin({
  piece, selected, onSelect,
}: { piece: JobPiece; selected: boolean; onSelect: () => void }) {
  if (piece.pinX == null || piece.pinY == null) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ left: `${piece.pinX * 100}%`, top: `${piece.pinY * 100}%` }}
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
