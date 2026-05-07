"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  type Job,
  type PipelineStatus,
  PIPELINE_LABELS,
  computeMargin,
} from "@shared/lib/types";
import { useJobs } from "@/lib/jobsStore";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { MarginCell } from "@shared/components/ui/MarginCell";
import { cn } from "@shared/lib/utils";

const COLUMNS: PipelineStatus[] = [
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

export function KanbanBoard({ jobs }: { jobs: Job[] }) {
  const { updateJob } = useJobs();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const grouped = useMemo(() => {
    const map = new Map<PipelineStatus, Job[]>();
    COLUMNS.forEach((c) => map.set(c, []));
    for (const job of jobs) {
      const list = map.get(job.pipelineStatus);
      if (list) list.push(job);
      else map.get("sold")?.push(job);
    }
    return map;
  }, [jobs]);

  const activeJob = activeId ? jobs.find((j) => j.id === activeId) : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const jobId = String(active.id);
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const overId = String(over.id);
    // overId may be a column id or a job id (when dropped over another card)
    let target: PipelineStatus | undefined = COLUMNS.find((c) => c === overId);
    if (!target) {
      const overJob = jobs.find((j) => j.id === overId);
      target = overJob?.pipelineStatus;
    }
    if (!target || target === job.pipelineStatus) return;

    updateJob(jobId, { pipelineStatus: target });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {COLUMNS.map((col) => {
          const items = grouped.get(col) ?? [];
          return <Column key={col} status={col} jobs={items} />;
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeJob ? <CardSurface job={activeJob} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  jobs,
}: {
  status: PipelineStatus;
  jobs: Job[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const totalValue = jobs.reduce((s, j) => s + j.revenue, 0);

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
            {PIPELINE_LABELS[status]}
          </span>
          <span className="text-xs text-text-tertiary tabular-nums">
            {jobs.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-[11px] text-text-tertiary tabular-nums">
            {formatCAD(totalValue)}
          </span>
        )}
      </div>
      <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2">
          {jobs.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-tertiary">
              Drop jobs here
            </div>
          ) : (
            jobs.map((job) => <SortableCard key={job.id} job={job} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ job }: { job: Job }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardSurface job={job} />
    </div>
  );
}

function CardSurface({ job, dragging }: { job: Job; dragging?: boolean }) {
  const margin = computeMargin(job);
  return (
    <Link
      href={`/jobs/${job.id}`}
      onClick={(e) => {
        // Disable navigation while dragging — the overlay clone shouldn't navigate.
        if (dragging) e.preventDefault();
      }}
      className={cn(
        "block bg-surface border rounded-md p-3 text-left transition-shadow duration-fast",
        dragging
          ? "border-accent shadow-md cursor-grabbing"
          : "border-border hover:border-border-strong hover:shadow-sm cursor-grab"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-xs tabular-nums text-text-tertiary uppercase tracking-wider">
          {job.code}
        </div>
        <HealthPill status={job.healthStatus} />
      </div>
      <div className="text-sm font-medium text-text-primary leading-snug mb-1.5 line-clamp-2">
        {job.name}
      </div>
      <div className="text-xs text-text-secondary mb-3 truncate">{job.client}</div>
      <div className="flex items-center justify-between text-xs">
        <span className="tabular-nums text-text-secondary">
          {formatCAD(job.revenue)}
        </span>
        <MarginCell margin={margin} />
      </div>
      <div className="text-[11px] text-text-tertiary tabular-nums mt-1.5 pt-1.5 border-t border-border">
        Install {formatDate(job.installDate)}
      </div>
    </Link>
  );
}
