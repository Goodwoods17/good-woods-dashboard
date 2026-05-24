"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import {
  type Job,
  type PipelineStatus,
  PIPELINE_LABELS,
  computeMargin,
} from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { StatusDot } from "@shared/components/ui/StatusDot";
import { MarginCell } from "@shared/components/ui/MarginCell";
import { HEALTH_LABELS } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { deriveHealth } from "@features/jobs/lib/health";

const STATUS_FILTERS: ("all" | PipelineStatus)[] = [
  "all",
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

export function JobsList({ jobs }: { jobs: Job[] }) {
  const [filter, setFilter] = useState<"all" | PipelineStatus>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (filter !== "all" && job.pipelineStatus !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !job.name.toLowerCase().includes(q) &&
          !job.client.toLowerCase().includes(q) &&
          !job.code.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs, clients, codes…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </div>
        <div className="flex items-center gap-1 bg-surface border border-border rounded-md p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors duration-fast",
                filter === s
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {s === "all" ? "All" : PIPELINE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted">
                <th className="w-3 pl-4 pr-0 py-2.5" aria-label="Health" />
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Job
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Client
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Pipeline
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Health
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Revenue
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  GM%
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Install
                </th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const margin = computeMargin(job);
                const health = deriveHealth(job);
                return (
                  <tr
                    key={job.id}
                    className="border-b border-border last:border-0 hover:bg-surface-muted/40 transition-colors duration-fast"
                  >
                    <td
                      className="pl-4 pr-0 py-3 align-middle"
                      title={HEALTH_LABELS[health]}
                    >
                      <StatusDot status={health} />
                      <span className="sr-only">{HEALTH_LABELS[health]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="block group"
                      >
                        <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors duration-fast">
                          {job.name}
                        </div>
                        <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
                          {job.code}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {job.client}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.pipelineStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <HealthPill status={health} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                      {formatCAD(job.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MarginCell margin={margin} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {formatDate(job.installDate)}
                    </td>
                    <td className="px-2 py-3 text-text-tertiary">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="block hover:text-text-primary transition-colors duration-fast"
                        aria-label={`Open ${job.name}`}
                      >
                        <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center">
      <div className="text-sm font-medium text-text-primary mb-1">
        No jobs match this filter
      </div>
      <p className="text-sm text-text-secondary">
        Clear the filter or search to see your full pipeline.
      </p>
    </div>
  );
}
