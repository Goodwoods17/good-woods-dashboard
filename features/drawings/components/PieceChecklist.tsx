"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { CutMethod, JobPiece } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import {
  lifecycle, nextStatus, progress, stageLabel, isCutTransition,
} from "../lib/pipelines";
import { CutMethodPrompt } from "./CutMethodPrompt";

export function PieceChecklist({
  pieces, selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  pieces: JobPiece[];
  selectedId: string | null;
  onSelect: (p: JobPiece) => void;
  onAdvance: (p: JobPiece) => void;
  onSetStatus: (p: JobPiece, status: string) => void;
  onSetCutMethod: (p: JobPiece, m: CutMethod) => void;
  onDelete: (p: JobPiece) => void;
}) {
  const cabinets = pieces.filter((p) => p.kind === "cabinet");
  const parts = pieces.filter((p) => p.kind !== "cabinet");
  const shared = { selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete };
  return (
    <div className="flex flex-col gap-4 p-3">
      {pieces.length === 0 && (
        <p className="px-1 text-xs text-text-tertiary">
          No pieces yet. Turn on <span className="font-medium">Add pin</span> and tap the drawing to track a cabinet or part.
        </p>
      )}
      <Group title="Cabinets" pieces={cabinets} {...shared} />
      <Group title="Parts" pieces={parts} {...shared} />
    </div>
  );
}

function Group({
  title, pieces, selectedId, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  title: string; pieces: JobPiece[]; selectedId: string | null;
  onSelect: (p: JobPiece) => void; onAdvance: (p: JobPiece) => void;
  onSetStatus: (p: JobPiece, s: string) => void; onSetCutMethod: (p: JobPiece, m: CutMethod) => void;
  onDelete: (p: JobPiece) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-micro font-semibold uppercase tracking-wider text-text-tertiary">
        {title} · {pieces.length}
      </h3>
      <div className="space-y-1">
        {pieces.map((p) => (
          <PieceRow key={p.id} piece={p} selected={selectedId === p.id}
            onSelect={() => onSelect(p)} onAdvance={() => onAdvance(p)}
            onSetStatus={(s) => onSetStatus(p, s)} onSetCutMethod={(m) => onSetCutMethod(p, m)}
            onDelete={() => onDelete(p)} />
        ))}
      </div>
    </div>
  );
}

function PieceRow({
  piece, selected, onSelect, onAdvance, onSetStatus, onSetCutMethod, onDelete,
}: {
  piece: JobPiece; selected: boolean; onSelect: () => void; onAdvance: () => void;
  onSetStatus: (s: string) => void; onSetCutMethod: (m: CutMethod) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [askCut, setAskCut] = useState(false);
  const { index, total } = progress(piece.kind, piece.status);

  function handleAdvance() {
    const to = nextStatus(piece.kind, piece.status);
    if (!to) return;
    if (isCutTransition(piece.kind, piece.status, to)) { setAskCut(true); return; }
    onSelect();
    onAdvance();
  }

  return (
    <div className={cn("rounded-md duration-fast", selected ? "bg-surface-muted" : "hover:bg-surface-muted")}>
      <div className="flex items-center gap-1">
        <button onClick={handleAdvance}
          className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md">
          <span className="min-w-0">
            <span className="block truncate text-sm text-text-primary">
              {piece.code ? `${piece.code} · ` : ""}{piece.label}
            </span>
            <span className="text-micro uppercase tracking-wider text-text-tertiary">
              {stageLabel(piece.status)}{piece.cutMethod ? ` · ${piece.cutMethod === "cnc_sub" ? "CNC" : "saw"}` : ""}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-micro tabular-nums text-text-secondary">
            {index}/{total}
          </span>
        </button>
        <button onClick={() => setOpen((v) => !v)} aria-label="Edit stage"
          className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary">
          <ChevronDown className={cn("h-4 w-4 duration-fast", open && "rotate-180")} />
        </button>
        <button onClick={() => (armed ? onDelete() : setArmed(true))}
          aria-label={armed ? `Confirm delete ${piece.label}` : `Delete ${piece.label}`}
          title={armed ? "Tap again to delete" : "Delete piece"}
          className={cn(
            "flex h-11 w-8 shrink-0 items-center justify-center rounded-md duration-fast",
            armed ? "bg-status-blocked text-white" : "text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
          )}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {askCut && (
        <div className="px-2.5 pb-2">
          <CutMethodPrompt label={piece.label}
            onPick={(m) => { setAskCut(false); onSelect(); onSetCutMethod(m); onAdvance(); }}
            onSkip={() => { setAskCut(false); onSelect(); onAdvance(); }} />
        </div>
      )}

      {open && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-2">
          {lifecycle(piece.kind).map((s) => (
            <button key={s} onClick={() => { onSetStatus(s); setOpen(false); }}
              className={cn(
                "rounded-full px-2 py-1 text-micro duration-fast",
                s === piece.status ? "bg-ink-pill text-white" : "bg-surface text-text-secondary hover:bg-surface-muted"
              )}>
              {stageLabel(s)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
