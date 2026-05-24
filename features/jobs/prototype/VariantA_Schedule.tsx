"use client";

// PROTOTYPE — Variant A — Schedule-first timeline.
// Time as the lead axis. Each job is a horizontal lane; the bar runs from
// a derived "start" (based on current pipeline stage) to the install date.
// Today is a vertical line. Window = today − 1w through today + 12w.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type Job,
  type PipelineStatus,
  PIPELINE_LABELS,
  computeMargin,
} from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { cn } from "@shared/lib/utils";

const WEEKS_AHEAD = 12;
const WEEKS_BEHIND = 1;

// Rough lead-time per stage, in days, so the bar tells the eye
// "this job still has lots to go" vs "this is imminent."
const STAGE_LEAD_DAYS: Record<PipelineStatus, number> = {
  new: 60,
  sold: 45,
  in_design: 30,
  in_production: 21,
  in_finishing: 10,
  installing: 3,
  complete: 0,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function VariantA_Schedule({ jobs }: { jobs: Job[] }) {
  const today = startOfDay(new Date());
  const windowStart = addDays(today, -WEEKS_BEHIND * 7);
  const windowEnd = addDays(today, WEEKS_AHEAD * 7);
  const totalDays = daysBetween(windowStart, windowEnd);

  const [hovered, setHovered] = useState<string | null>(null);

  // Sort by install date soonest-first; keep completes at the bottom.
  const ordered = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (a.pipelineStatus === "complete" && b.pipelineStatus !== "complete") return 1;
      if (b.pipelineStatus === "complete" && a.pipelineStatus !== "complete") return -1;
      return a.installDate.localeCompare(b.installDate);
    });
  }, [jobs]);

  // Week tick offsets (in %) across the window.
  const weekTicks = useMemo(() => {
    const ticks: { offsetPct: number; date: Date; label: string }[] = [];
    for (let w = 0; w <= WEEKS_AHEAD + WEEKS_BEHIND; w++) {
      const date = addDays(windowStart, w * 7);
      const offsetPct = (w * 7 / totalDays) * 100;
      const label = date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
      ticks.push({ offsetPct, date, label });
    }
    return ticks;
  }, [windowStart, totalDays]);

  const todayPct = (daysBetween(windowStart, today) / totalDays) * 100;

  return (
    <div className="space-y-3">
      {/* Legend / scale strip */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[220px_1fr] border-b border-border bg-surface-muted">
          <div className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary border-r border-border">
            Job · Client
          </div>
          <div className="relative h-8">
            {weekTicks.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                style={{ left: `${t.offsetPct}%` }}
              >
                <span className="text-[10px] tabular-nums text-text-tertiary leading-none">
                  {t.label}
                </span>
              </div>
            ))}
            {/* Today line in header */}
            <div
              className="absolute top-0 bottom-0 w-px bg-accent"
              style={{ left: `${todayPct}%` }}
            />
          </div>
        </div>

        {/* Lanes */}
        <div className="relative">
          {ordered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-secondary">
              No jobs in the pipeline.
            </div>
          ) : (
            ordered.map((job) => (
              <Lane
                key={job.id}
                job={job}
                windowStart={windowStart}
                totalDays={totalDays}
                hovered={hovered === job.id}
                onHover={(h) => setHovered(h ? job.id : null)}
              />
            ))
          )}

          {/* Today vertical line spans full lane area */}
          <div
            className="absolute top-0 bottom-0 w-px bg-accent/40 pointer-events-none"
            style={{ left: `calc(220px + ${todayPct}% * (100% - 220px) / 100%)` }}
          />
        </div>
      </div>

      <p className="text-xs text-text-tertiary px-1">
        Each bar runs from a derived start date (based on current stage) to the install date.
        Marker = install date. Today is the orange line. Drag/click coming in v2.
      </p>
    </div>
  );
}

function Lane({
  job,
  windowStart,
  totalDays,
  hovered,
  onHover,
}: {
  job: Job;
  windowStart: Date;
  totalDays: number;
  hovered: boolean;
  onHover: (h: boolean) => void;
}) {
  const install = new Date(job.installDate + "T12:00:00");
  const leadDays = STAGE_LEAD_DAYS[job.pipelineStatus];
  const derivedStart = addDays(install, -leadDays);

  const startOffset = daysBetween(windowStart, derivedStart);
  const endOffset = daysBetween(windowStart, install);

  // Clip to window.
  const clippedStart = Math.max(0, startOffset);
  const clippedEnd = Math.min(totalDays, endOffset);
  const visible = clippedEnd > 0 && clippedStart < totalDays;

  const leftPct = (clippedStart / totalDays) * 100;
  const widthPct = Math.max(1.5, ((clippedEnd - clippedStart) / totalDays) * 100);

  const isPast = endOffset < 0;
  const isFuture = startOffset > totalDays;

  const barColor =
    job.pipelineStatus === "complete"
      ? "bg-status-paused/40 border-status-paused"
      : job.healthStatus === "blocked"
      ? "bg-status-blocked/30 border-status-blocked"
      : job.healthStatus === "at_risk"
      ? "bg-status-at-risk/30 border-status-at-risk"
      : "bg-status-on-track/30 border-status-on-track";

  const margin = computeMargin(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "grid grid-cols-[220px_1fr] border-b border-border last:border-0 transition-colors duration-fast group",
        hovered ? "bg-surface-muted/40" : "hover:bg-surface-muted/20"
      )}
    >
      <div className="px-4 py-2.5 border-r border-border min-w-0">
        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
          {job.name}
        </div>
        <div className="text-xs text-text-tertiary truncate">{job.client}</div>
      </div>
      <div className="relative h-12">
        {visible && !isPast && !isFuture && (
          <>
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 h-4 rounded border",
                barColor
              )}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
            {/* Install marker dot at end */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-text-primary bg-surface"
              style={{ left: `${(endOffset / totalDays) * 100}%` }}
            />
          </>
        )}
        {isPast && (
          <div className="absolute top-1/2 -translate-y-1/2 left-3 flex items-center gap-2">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Installed {formatDate(job.installDate)}
            </span>
          </div>
        )}
        {isFuture && (
          <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-2">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Future — {formatDate(job.installDate)}
            </span>
          </div>
        )}
        {hovered && (
          <div className="absolute top-1 right-2 flex items-center gap-2 pointer-events-none">
            <HealthPill status={job.healthStatus} />
            <span className="text-[11px] tabular-nums text-text-secondary">
              {formatCAD(job.revenue)} · {margin.marginPct.toFixed(0)}%
            </span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              {PIPELINE_LABELS[job.pipelineStatus]}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
