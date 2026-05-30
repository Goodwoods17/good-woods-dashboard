"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Check, RotateCcw, X, Pencil } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  WORK_STATIONS,
  timeOnStation,
  isStale,
  type WorkStation,
  type WorkUnit,
} from "@features/shop/lib/shopStore";

/**
 * A single work-unit card. Floats on shadow (no border per the Ghost-Border
 * Rule), leads with a status dot readable from across the shop, and carries
 * an accessible station-move control so movement never depends on drag alone.
 */
export function WorkUnitCard({
  unit,
  jobCode,
  jobTitle,
  onEdit,
  onMove,
  onComplete,
  onReopen,
  onRemove,
  draggable = true,
}: {
  unit: WorkUnit;
  jobCode?: string;
  jobTitle?: string;
  onEdit: () => void;
  onMove: (station: WorkStation) => void;
  onComplete: () => void;
  onReopen: () => void;
  onRemove: () => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: unit.id,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const done = unit.completedAt !== null;
  const stale = !done && isStale(unit.startedAt);
  const dotClass = done ? "bg-status-complete" : stale ? "bg-status-at-risk" : "bg-accent";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl bg-surface p-3 shadow-resting transition-shadow duration-fast",
        isDragging ? "opacity-60 shadow-hover" : "hover:shadow-hover",
        done && "opacity-75"
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-micro uppercase tracking-wider tabular-nums text-text-tertiary">
              {jobCode ?? "Unlinked"}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-micro tabular-nums",
                stale ? "text-status-at-risk" : "text-text-tertiary"
              )}
            >
              {done ? "done" : `${timeOnStation(unit.startedAt)} here`}
            </span>
          </div>
          <p
            className={cn(
              "mt-0.5 text-sm leading-snug text-text-primary",
              done && "line-through decoration-text-tertiary/50"
            )}
          >
            {unit.description}
          </p>
          {jobTitle && <p className="mt-0.5 truncate text-xs text-text-secondary">{jobTitle}</p>}
          {unit.notes && <p className="mt-1 text-xs italic text-text-tertiary">{unit.notes}</p>}
        </div>

        {draggable && (
          <button
            type="button"
            className="-mr-1 -mt-1 hidden cursor-grab touch-none rounded-md p-1 text-text-tertiary opacity-0 transition-opacity duration-fast hover:text-text-secondary group-hover:opacity-100 active:cursor-grabbing md:block"
            aria-label="Drag to move"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Controls: accessible move + lifecycle. 44px tap targets on touch. */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`move-${unit.id}`}>
          Move {unit.description} to station
        </label>
        <select
          id={`move-${unit.id}`}
          value={unit.station}
          onChange={(e) => onMove(e.target.value as WorkStation)}
          disabled={done}
          className="min-h-[36px] flex-1 rounded-md bg-surface-muted px-2 py-1 text-xs text-text-secondary transition-colors duration-fast hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-50"
        >
          {WORK_STATIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        {done ? (
          <IconButton label="Reopen" onClick={onReopen}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          </IconButton>
        ) : (
          <IconButton label="Mark complete" tone="go" onClick={onComplete}>
            <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
          </IconButton>
        )}
        <IconButton label="Edit unit" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </IconButton>
        <IconButton label="Remove unit" tone="danger" onClick={onRemove}>
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "go" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-muted",
        tone === "go" && "hover:bg-status-on-track-soft hover:text-status-on-track",
        tone === "danger" && "hover:bg-status-blocked-soft hover:text-status-blocked"
      )}
    >
      {children}
    </button>
  );
}
