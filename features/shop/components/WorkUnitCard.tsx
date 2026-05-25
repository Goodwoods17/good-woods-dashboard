"use client";

import { useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { cn } from "@shared/lib/utils";

type Unit = {
  id: string;
  jobCode: string;
  description: string;
  startedAt: string;
};

export function WorkUnitCard({
  unit,
  onRemove,
}: {
  unit: Unit;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: unit.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-surface border rounded-md p-2.5 group cursor-grab",
        isDragging
          ? "border-accent shadow-md opacity-60 cursor-grabbing"
          : "border-border hover:border-border-strong"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-micro uppercase tracking-wider tabular-nums text-text-tertiary">
          {unit.jobCode}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
          aria-label="Remove"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
      <div className="text-sm text-text-primary leading-snug mb-1.5">
        {unit.description}
      </div>
      <div className="text-micro tabular-nums text-text-tertiary">
        {hoursAgo(unit.startedAt)} on station
      </div>
    </div>
  );
}

function hoursAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
