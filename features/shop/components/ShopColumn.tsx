"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@shared/lib/utils";
import type { WorkStation } from "@features/shop/lib/shopStore";
import { WorkUnitCard } from "./WorkUnitCard";

type Unit = {
  id: string;
  jobCode: string;
  description: string;
  startedAt: string;
};

export function ShopColumn({
  station,
  label,
  wip,
  count,
  overLimit,
  units,
  onRemove,
}: {
  station: WorkStation;
  label: string;
  wip: number;
  count: number;
  overLimit: boolean;
  units: Unit[];
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: station });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border bg-surface-muted/40 transition-colors duration-fast min-h-[300px]",
        isOver ? "border-accent bg-accent-soft/30" : "border-border"
      )}
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {label}
          </span>
          <span
            className={cn(
              "text-xs tabular-nums px-1.5 rounded",
              overLimit
                ? "text-status-blocked bg-status-blocked-soft font-semibold"
                : "text-text-tertiary"
            )}
          >
            {count} / {wip}
          </span>
        </div>
        {overLimit && (
          <span className="text-[10px] uppercase tracking-wider text-status-blocked font-semibold">
            Over WIP
          </span>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2">
        {units.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-tertiary">
            Drag units here
          </div>
        ) : (
          units.map((u) => (
            <WorkUnitCard key={u.id} unit={u} onRemove={() => onRemove(u.id)} />
          ))
        )}
      </div>
    </div>
  );
}
