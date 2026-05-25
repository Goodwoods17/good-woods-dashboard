"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Job, HealthStatus } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

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

export function CalendarView({ jobs }: { jobs: Job[] }) {
  // Initial view = month containing the earliest upcoming install.
  const initialMonth = useMemo(() => {
    const today = new Date();
    const upcoming = jobs
      .map((j) => new Date(j.installDate + "T12:00:00"))
      .filter((d) => d >= startOfMonth(today))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return startOfMonth(upcoming ?? today);
  }, [jobs]);

  const [cursor, setCursor] = useState<Date>(initialMonth);

  const monthLabel = cursor.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  // Build a 6-row × 7-col grid starting on the Sunday on or before day 1.
  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDay = new Date(first);
    startDay.setDate(first.getDate() - first.getDay()); // back up to Sunday
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
      const key = job.installDate;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const todayKey = ymd(new Date());

  // Summary chips for this month
  const monthlyJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        const d = new Date(j.installDate + "T12:00:00");
        return (
          d.getFullYear() === cursor.getFullYear() &&
          d.getMonth() === cursor.getMonth()
        );
      })
      .sort((a, b) => a.installDate.localeCompare(b.installDate));
  }, [jobs, cursor]);

  const monthlyValue = monthlyJobs.reduce((s, j) => s + j.revenue, 0);

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-md p-1">
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            aria-label="Previous month"
            className="p-1.5 rounded hover:bg-surface-muted text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Next month"
            className="p-1.5 rounded hover:bg-surface-muted text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="text-sm font-semibold text-text-primary">
          {monthLabel}
        </div>
        <div className="text-xs text-text-tertiary tabular-nums">
          {monthlyJobs.length} install{monthlyJobs.length === 1 ? "" : "s"} ·{" "}
          {formatCAD(monthlyValue)}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-label font-medium uppercase text-text-tertiary text-center"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6">
          {weeks.flat().map((d, idx) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const key = ymd(d);
            const dayJobs = jobsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[96px] border-r border-b border-border last:border-r-0 p-1.5 flex flex-col",
                  !inMonth && "bg-surface-muted/40",
                  inMonth && isWeekend && "bg-surface-muted/20"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      !inMonth && "text-text-disabled",
                      inMonth && !isToday && "text-text-secondary",
                      isToday &&
                        "h-5 w-5 rounded-full bg-accent text-white grid place-items-center text-caption font-semibold"
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-1 overflow-hidden">
                  {dayJobs.slice(0, 3).map((job) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="block text-caption rounded px-1.5 py-1 bg-accent-soft text-accent hover:bg-accent hover:text-white transition-colors duration-fast truncate"
                      title={`${job.name} — ${job.client}`}
                    >
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full mr-1.5",
                          HEALTH_DOT[job.healthStatus]
                        )}
                      />
                      {job.client}
                    </Link>
                  ))}
                  {dayJobs.length > 3 && (
                    <div className="text-micro text-text-tertiary px-1.5">
                      +{dayJobs.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {monthlyJobs.length > 0 && (
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-surface-muted">
            <h2 className="text-sm font-semibold text-text-primary">
              This month — {monthlyJobs.length} install{monthlyJobs.length === 1 ? "" : "s"}
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {monthlyJobs.map((job) => {
              const margin = computeMargin(job);
              const dateLabel = new Date(job.installDate + "T12:00:00").toLocaleDateString(
                "en-CA",
                { weekday: "short", month: "short", day: "numeric" }
              );
              return (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-surface-muted/40 transition-colors duration-fast"
                  >
                    <div className="text-xs text-text-tertiary tabular-nums w-24 shrink-0">
                      {dateLabel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">
                        {job.name}
                      </div>
                      <div className="text-xs text-text-secondary truncate">
                        {job.client} · {job.address}
                      </div>
                    </div>
                    <div className="text-xs text-text-tertiary tabular-nums shrink-0">
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
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
