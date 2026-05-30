"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Job, HealthStatus } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useJobs } from "@features/jobs/lib/jobsStore";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HEALTH_DOT: Record<HealthStatus, string> = {
  on_track: "bg-status-on-track",
  at_risk: "bg-status-at-risk",
  blocked: "bg-status-blocked",
  complete: "bg-status-complete",
  paused: "bg-status-paused",
};

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function CalendarView() {
  const { jobs, updateJob, loading } = useJobs();
  const isMobile = useIsMobile();

  const initialMonth = useMemo(() => {
    const today = new Date();
    const upcoming = jobs
      .filter((j) => j.installDate)
      .map((j) => new Date(j.installDate + "T12:00:00"))
      .filter((d) => d >= startOfMonth(today))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return startOfMonth(upcoming ?? today);
  }, [jobs]);

  const [cursor, setCursor] = useState<Date>(initialMonth);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  const monthLabel = cursor.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDay = new Date(first);
    startDay.setDate(first.getDate() - first.getDay());
    const rows: Date[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: Date[] = [];
      for (let c = 0; c < 7; c++) {
        const d = new Date(startDay);
        d.setDate(startDay.getDate() + r * 7 + c);
        row.push(d);
      }
      rows.push(row);
    }
    return rows;
  }, [cursor]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.installDate) continue;
      const list = map.get(job.installDate) ?? [];
      list.push(job);
      map.set(job.installDate, list);
    }
    return map;
  }, [jobs]);

  const monthlyJobs = useMemo(
    () =>
      jobs
        .filter((j) => {
          if (!j.installDate) return false;
          const d = new Date(j.installDate + "T12:00:00");
          return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
        })
        .sort((a, b) => a.installDate.localeCompare(b.installDate)),
    [jobs, cursor]
  );

  const monthlyValue = monthlyJobs.reduce((s, j) => s + j.revenue, 0);
  const todayKey = ymd(new Date());
  const activeJob = activeId ? (jobs.find((j) => j.id === activeId) ?? null) : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const job = jobs.find((j) => j.id === String(active.id));
    const dayKey = String(over.id);
    if (!job || job.installDate === dayKey) return;
    updateJob(job.id, { installDate: dayKey });
    setMoved(`Moved ${job.client} to ${shortDate(dayKey)}`);
    window.setTimeout(() => setMoved(null), 4000);
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-floating">
        <StepBtn label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </StepBtn>
        <button
          onClick={() => setCursor(startOfMonth(new Date()))}
          className="rounded-full px-3 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
        >
          Today
        </button>
        <StepBtn label="Next month" onClick={() => setCursor(addMonths(cursor, 1))}>
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </StepBtn>
      </div>
      <h2 className="font-serif text-title font-medium text-text-primary">{monthLabel}</h2>
      <p className="font-mono text-xs tabular-nums text-text-tertiary">
        {monthlyJobs.length} install{monthlyJobs.length === 1 ? "" : "s"} ·{" "}
        {formatCAD(monthlyValue)}
      </p>
    </div>
  );

  return (
    <div className="max-w-7xl space-y-4">
      {header}

      <p
        aria-live="polite"
        className={cn(
          "text-xs text-status-on-track transition-opacity duration-base",
          moved ? "opacity-100" : "h-0 opacity-0"
        )}
      >
        {moved}
      </p>

      {loading ? (
        <CalendarSkeleton mobile={isMobile} />
      ) : isMobile ? (
        <Agenda jobs={monthlyJobs} />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-resting">
            <div className="grid grid-cols-7 bg-surface-muted/60">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-label font-medium uppercase text-text-tertiary"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 grid-rows-6">
              {weeks.flat().map((d, idx) => (
                <DayCell
                  key={idx}
                  date={d}
                  inMonth={d.getMonth() === cursor.getMonth()}
                  isToday={ymd(d) === todayKey}
                  isPast={ymd(d) < todayKey}
                  jobs={jobsByDate.get(ymd(d)) ?? []}
                />
              ))}
            </div>
          </div>

          {monthlyJobs.length > 0 && <MonthList jobs={monthlyJobs} />}
        </DndContext>
      )}

      <DragOverlay dropAnimation={{ duration: 0 }}>
        {activeJob ? <JobChip job={activeJob} dragging /> : null}
      </DragOverlay>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-muted hover:text-text-primary"
    >
      {children}
    </button>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
  isPast,
  jobs,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  jobs: Job[];
}) {
  const key = ymd(date);
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const overdue = isPast && inMonth && jobs.length > 0;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? jobs : jobs.slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[104px] flex-col gap-1 border-b border-r border-border-faint p-1.5 [&:nth-child(7n)]:border-r-0 transition-colors duration-fast",
        !inMonth && "bg-surface-muted/30",
        inMonth && isWeekend && "bg-surface-muted/15",
        overdue && "bg-status-at-risk-soft/30",
        isOver && "bg-accent-soft/50"
      )}
    >
      <span
        className={cn(
          "self-start text-xs tabular-nums",
          !inMonth && "text-text-disabled",
          inMonth && !isToday && "text-text-secondary",
          isToday &&
            "grid h-5 w-5 place-items-center rounded-full bg-accent-soft font-semibold text-accent"
        )}
      >
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-1">
        {shown.map((job) => (
          <DraggableChip key={job.id} job={job} />
        ))}
        {!expanded && jobs.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            className="px-1.5 text-left text-micro text-text-tertiary hover:text-text-secondary"
          >
            +{jobs.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableChip({ job }: { job: Job }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <JobChip job={job} />
    </div>
  );
}

function JobChip({ job, dragging = false }: { job: Job; dragging?: boolean }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      onClick={(e) => dragging && e.preventDefault()}
      title={`${job.name} · ${job.client}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption text-text-primary transition-colors duration-fast",
        dragging ? "bg-surface shadow-hover" : "bg-surface-muted hover:bg-accent-soft"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", HEALTH_DOT[job.healthStatus])} />
      <span className="truncate">{job.client}</span>
    </Link>
  );
}

function MonthList({ jobs }: { jobs: Job[] }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-resting">
      <div className="px-5 py-3 text-label font-medium uppercase text-text-tertiary">
        This month
      </div>
      <ul className="divide-y divide-border-faint">
        {jobs.map((job) => (
          <MonthRow key={job.id} job={job} />
        ))}
      </ul>
    </section>
  );
}

function MonthRow({ job }: { job: Job }) {
  const margin = computeMargin(job);
  return (
    <li>
      <Link
        href={`/jobs/${job.id}`}
        className="flex items-center gap-4 px-5 py-3 transition-colors duration-fast hover:bg-surface-muted/40"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT[job.healthStatus])} />
        <div className="w-24 shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
          {shortDate(job.installDate)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">{job.name}</div>
          <div className="truncate text-xs text-text-secondary">
            {job.client} · {job.address}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-xs tabular-nums text-text-tertiary">
          {formatCAD(job.revenue)} · GM{" "}
          <span
            className={cn(
              margin.band === "on_track" && "text-status-on-track",
              margin.band === "at_risk" && "text-status-at-risk",
              margin.band === "blocked" && "text-status-blocked"
            )}
          >
            {margin.marginPct.toFixed(0)}%
          </span>
        </div>
      </Link>
    </li>
  );
}

function Agenda({ jobs }: { jobs: Job[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const list = map.get(j.installDate) ?? [];
      list.push(j);
      map.set(j.installDate, list);
    }
    return Array.from(map.entries());
  }, [jobs]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl bg-surface px-6 py-12 text-center shadow-resting">
        <p className="text-sm text-text-secondary">No installs this month.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([date, dayJobs]) => (
        <div key={date}>
          <div className="mb-1.5 px-1 font-mono text-xs uppercase tracking-wider tabular-nums text-text-tertiary">
            {shortDate(date)}
          </div>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-resting">
            <ul className="divide-y divide-border-faint">
              {dayJobs.map((job) => (
                <MonthRowMobile key={job.id} job={job} />
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthRowMobile({ job }: { job: Job }) {
  const margin = computeMargin(job);
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", HEALTH_DOT[job.healthStatus])} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">{job.name}</div>
          <div className="truncate text-xs text-text-secondary">{job.client}</div>
        </div>
        <div className="shrink-0 text-right font-mono text-xs tabular-nums">
          <div className="text-text-primary">{formatCAD(job.revenue)}</div>
          <div
            className={cn(
              margin.band === "on_track" && "text-status-on-track",
              margin.band === "at_risk" && "text-status-at-risk",
              margin.band === "blocked" && "text-status-blocked"
            )}
          >
            GM {margin.marginPct.toFixed(0)}%
          </div>
        </div>
      </Link>
    </li>
  );
}

function CalendarSkeleton({ mobile }: { mobile: boolean }) {
  if (mobile) {
    return (
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-surface shadow-resting" />
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-resting" aria-hidden>
      <div className="grid grid-cols-7 grid-rows-6">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="min-h-[104px] border-b border-r border-border-faint p-1.5">
            <div className="h-4 w-4 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
