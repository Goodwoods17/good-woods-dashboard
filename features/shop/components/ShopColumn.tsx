"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@shared/lib/utils";
import { WorkUnitCard } from "./WorkUnitCard";
import type { WorkStation, WorkUnit } from "@features/shop/lib/shopStore";

export type JobLookup = (jobId: string | null) => { code?: string; title?: string };

export function ShopColumn({
  station,
  label,
  wip,
  units,
  jobLookup,
  onEdit,
  onMove,
  onComplete,
  onReopen,
  onRemove,
  droppable = true,
}: {
  station: WorkStation;
  label: string;
  wip: number;
  units: WorkUnit[];
  jobLookup: JobLookup;
  onEdit: (unit: WorkUnit) => void;
  onMove: (id: string, station: WorkStation) => void;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onRemove: (id: string) => void;
  droppable?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: station, disabled: !droppable });
  const count = units.length;
  const overLimit = count > wip;
  const atLimit = count === wip;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[180px] flex-col rounded-2xl bg-surface-muted/40 p-2 transition-colors duration-fast",
        isOver && "bg-accent-soft/40 ring-2 ring-inset ring-accent-soft"
      )}
      aria-label={`${label} station, ${count} of ${wip} work units`}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2 className="font-serif text-base font-medium tracking-[-0.01em] text-text-primary">
          {label}
        </h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-micro tabular-nums",
            overLimit
              ? "bg-status-blocked-soft font-semibold text-status-blocked"
              : atLimit
                ? "bg-status-at-risk-soft font-medium text-status-at-risk"
                : "text-text-tertiary"
          )}
          title={overLimit ? "Over WIP limit" : atLimit ? "At WIP limit" : undefined}
        >
          {count}/{wip}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 p-1">
        {count === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-text-tertiary">
            Nothing at {label.toLowerCase()}
          </p>
        ) : (
          units.map((u) => {
            const job = jobLookup(u.jobId);
            return (
              <WorkUnitCard
                key={u.id}
                unit={u}
                jobCode={job.code}
                jobTitle={job.title}
                draggable={droppable}
                onEdit={() => onEdit(u)}
                onMove={(s) => onMove(u.id, s)}
                onComplete={() => onComplete(u.id)}
                onReopen={() => onReopen(u.id)}
                onRemove={() => onRemove(u.id)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
