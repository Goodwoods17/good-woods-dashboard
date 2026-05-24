"use client";

// Schedule + blocker overlay — timeline lanes view.
// Time as the lead axis, with each lane carrying the next-step text + a
// blocker chip so the "what's holding this up?" answer lands in the same
// glance as "when's it due?"
//
// Blocker text is currently synthetic (see lib/blockers.ts). Demo chips
// flag it inline.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type Job,
  PIPELINE_LABELS,
  computeMargin,
} from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { cn } from "@shared/lib/utils";
import {
  getBlocker,
  getNextStep,
  BLOCKER_META,
  BLOCKER_IS_SYNTHETIC,
} from "@features/jobs/lib/blockers";
import { deriveHealth } from "@features/jobs/lib/health";
import { STAGE_LEAD_DAYS } from "@features/jobs/lib/health";

const WEEKS_AHEAD = 12;
const WEEKS_BEHIND = 1;

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

export function Schedule({ jobs }: { jobs: Job[] }) {
  const today = startOfDay(new Date());
  const windowStart = addDays(today, -WEEKS_BEHIND * 7);
  const windowEnd = addDays(today, WEEKS_AHEAD * 7);
  const totalDays = daysBetween(windowStart, windowEnd);

  const [hovered, setHovered] = useState<string | null>(null);

  const ordered = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (a.pipelineStatus === "complete" && b.pipelineStatus !== "complete") return 1;
      if (b.pipelineStatus === "complete" && a.pipelineStatus !== "complete") return -1;
      return a.installDate.localeCompare(b.installDate);
    });
  }, [jobs]);

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
      <div className="bg-surface rounded-xl shadow-resting overflow-hidden">
        <div className="grid grid-cols-[280px_1fr] border-b border-border-faint bg-surface-muted/60">
          <div className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary border-r border-border">
            Job · Next step
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
            <div
              className="absolute top-0 bottom-0 w-px bg-accent"
              style={{ left: `${todayPct}%` }}
            />
          </div>
        </div>

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
        </div>
      </div>

      <p className="text-xs text-text-tertiary px-1">
        Each lane shows the job&rsquo;s next step on the left and the install bar on
        the right. The blocker chip beside the next step says what&rsquo;s holding it
        up. Orange line = today.
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

  const clippedStart = Math.max(0, startOffset);
  const clippedEnd = Math.min(totalDays, endOffset);
  const visible = clippedEnd > 0 && clippedStart < totalDays;

  const leftPct = (clippedStart / totalDays) * 100;
  const widthPct = Math.max(1.5, ((clippedEnd - clippedStart) / totalDays) * 100);

  const isPast = endOffset < 0;
  const isFuture = startOffset > totalDays;

  const health = deriveHealth(job);
  const barColor =
    job.pipelineStatus === "complete"
      ? "bg-status-paused/40 border-status-paused"
      : health === "blocked"
      ? "bg-status-blocked/30 border-status-blocked"
      : health === "at_risk"
      ? "bg-status-at-risk/30 border-status-at-risk"
      : "bg-status-on-track/30 border-status-on-track";

  const margin = computeMargin(job);
  const blocker = getBlocker(job);
  const nextStep = getNextStep(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "grid grid-cols-[280px_1fr] border-b border-border last:border-0 transition-colors duration-fast group",
        hovered ? "bg-surface-muted/40" : "hover:bg-surface-muted/20"
      )}
    >
      <div className="px-4 py-2.5 border-r border-border min-w-0">
        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
          {job.name}
        </div>
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <BlockerChip kind={blocker} />
          <span className="text-xs text-text-secondary truncate">
            {nextStep}
          </span>
        </div>
      </div>
      <div className="relative h-14">
        {visible && !isPast && !isFuture && (
          <>
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 h-4 rounded border",
                barColor
              )}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
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
            <HealthPill status={health} />
            <span className="text-[11px] tabular-nums text-text-secondary">
              {formatCAD(job.revenue)} · {margin.marginPct.toFixed(0)}%
            </span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-[0.04em]">
              {PIPELINE_LABELS[job.pipelineStatus]}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function BlockerChip({ kind }: { kind: keyof typeof BLOCKER_META }) {
  const meta = BLOCKER_META[kind];
  if (kind === "none") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.04em] bg-status-on-track-soft text-status-on-track">
        Clear
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.04em] shrink-0",
        meta.tone === "blocked" && "bg-status-blocked-soft text-status-blocked",
        meta.tone === "at_risk" && "bg-status-at-risk-soft text-status-at-risk",
        meta.tone === "neutral" && "bg-surface-muted text-text-secondary"
      )}
      title={`${meta.label}${BLOCKER_IS_SYNTHETIC ? " · synthetic demo data" : ""}`}
    >
      {meta.short}
      {BLOCKER_IS_SYNTHETIC && (
        <span className="rounded-sm bg-surface-sunken/70 px-0.5 text-[8px] text-text-tertiary">
          demo
        </span>
      )}
    </span>
  );
}
