"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ChevronDown, ChevronRight, ChevronUp, Inbox, Search } from "lucide-react";
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
import { deriveHealth, daysToInstall } from "@features/jobs/lib/health";

type SavedView = "all" | "at_risk" | "this_week" | "installing";

const SAVED_VIEWS: { key: SavedView; label: string; description: string }[] = [
  { key: "all", label: "All", description: "Every job, no extra filter" },
  { key: "at_risk", label: "At risk", description: "Health derives to at-risk or blocked" },
  { key: "this_week", label: "This week", description: "Installs within the next 7 days" },
  { key: "installing", label: "Installing", description: "Pipeline stage is Installing" },
];

const STATUS_FILTERS: ("all" | PipelineStatus)[] = [
  "all",
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

function isSavedView(v: string | null): v is SavedView {
  return v !== null && SAVED_VIEWS.some((s) => s.key === v);
}

function readFilterFromUrl(): SavedView {
  if (typeof window === "undefined") return "all";
  const params = new URLSearchParams(window.location.search);
  const v = params.get("filter");
  return isSavedView(v) ? v : "all";
}

function writeFilterToUrl(view: SavedView) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (view === "all") url.searchParams.delete("filter");
  else url.searchParams.set("filter", view);
  window.history.replaceState({}, "", url.toString());
}

type SortDir = "asc" | "desc" | null;

export function JobsList({ jobs }: { jobs: Job[] }) {
  const [savedView, setSavedView] = useState<SavedView>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PipelineStatus>("all");
  const [query, setQuery] = useState("");
  const [installSort, setInstallSort] = useState<SortDir>(null);

  // Read initial filter from URL on mount (deep-link support).
  useEffect(() => {
    setSavedView(readFilterFromUrl());
  }, []);

  function pickSavedView(next: SavedView) {
    setSavedView(next);
    writeFilterToUrl(next);
    // Saved view overrides any narrow status filter — reset it.
    setStatusFilter("all");
  }

  const filtered = useMemo(() => {
    const now = new Date();
    const passes = jobs.filter((job) => {
      // Saved-view filter
      if (savedView === "at_risk") {
        const h = deriveHealth(job, now);
        if (h !== "at_risk" && h !== "blocked") return false;
      } else if (savedView === "this_week") {
        const days = daysToInstall(job.installDate, now);
        if (days < 0 || days > 7) return false;
        if (job.pipelineStatus === "complete") return false;
      } else if (savedView === "installing") {
        if (job.pipelineStatus !== "installing") return false;
      }
      // Status filter (combines with saved view)
      if (statusFilter !== "all" && job.pipelineStatus !== statusFilter) {
        return false;
      }
      // Free-text query
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
    if (installSort) {
      passes.sort((a, b) => {
        const cmp = a.installDate.localeCompare(b.installDate);
        return installSort === "asc" ? cmp : -cmp;
      });
    }
    return passes;
  }, [jobs, savedView, statusFilter, query, installSort]);

  function toggleInstallSort() {
    setInstallSort((prev) =>
      prev === null ? "asc" : prev === "asc" ? "desc" : null
    );
  }

  function clearAll() {
    setQuery("");
    pickSavedView("all");
    setStatusFilter("all");
  }

  // Count badges on the saved-view chips
  const counts = useMemo(() => {
    const now = new Date();
    const c = { all: 0, at_risk: 0, this_week: 0, installing: 0 } as Record<SavedView, number>;
    c.all = jobs.length;
    for (const j of jobs) {
      const h = deriveHealth(j, now);
      if (h === "at_risk" || h === "blocked") c.at_risk += 1;
      const days = daysToInstall(j.installDate, now);
      if (days >= 0 && days <= 7 && j.pipelineStatus !== "complete") c.this_week += 1;
      if (j.pipelineStatus === "installing") c.installing += 1;
    }
    return c;
  }, [jobs]);

  const filtersActive =
    savedView !== "all" || statusFilter !== "all" || query.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SAVED_VIEWS.map(({ key, label, description }) => (
          <button
            key={key}
            onClick={() => pickSavedView(key)}
            title={description}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
              savedView === key
                ? "bg-ink-pill text-white"
                : "bg-surface text-text-secondary hover:text-text-primary shadow-resting"
            )}
            aria-pressed={savedView === key}
          >
            {label}
            <span
              className={cn(
                "tabular-nums",
                savedView === key ? "text-white/70" : "text-text-tertiary"
              )}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex flex-wrap items-center gap-1 bg-surface rounded-md p-1 shadow-resting">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors duration-fast",
                statusFilter === s
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-text-secondary hover:text-text-primary"
              )}
              aria-pressed={statusFilter === s}
            >
              {s === "all" ? "All stages" : PIPELINE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState filtersActive={filtersActive} onClear={clearAll} />
      ) : (
        <div className="bg-surface rounded-xl shadow-resting overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-faint bg-surface-muted/60">
                <th className="w-3 pl-4 pr-0 py-2.5" aria-label="Health" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  Job
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  Client
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  Pipeline
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  Health
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  Revenue
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  GM%
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                  <button
                    onClick={toggleInstallSort}
                    className="inline-flex items-center gap-1 hover:text-text-secondary transition-colors duration-fast"
                    aria-label={`Sort by install date ${installSort === "asc" ? "(ascending)" : installSort === "desc" ? "(descending)" : ""}`}
                  >
                    Install
                    {installSort === "asc" && <ChevronUp className="h-3 w-3" strokeWidth={2} />}
                    {installSort === "desc" && <ChevronDown className="h-3 w-3" strokeWidth={2} />}
                    {installSort === null && <ArrowDownUp className="h-3 w-3 opacity-50" strokeWidth={2} />}
                  </button>
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
                    className="border-b border-border-faint last:border-0 hover:bg-surface-muted/40 transition-colors duration-fast"
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
                        <div className="text-sm font-normal text-text-primary group-hover:text-accent transition-colors duration-fast">
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

function EmptyState({
  filtersActive,
  onClear,
}: {
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="bg-surface rounded-xl shadow-resting p-12 text-center">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-surface-muted mb-4">
        <Inbox className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
      </div>
      <div className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em] mb-1">
        Nothing matches the current filter
      </div>
      <p className="text-sm text-text-secondary mb-5 max-w-md mx-auto leading-relaxed">
        {filtersActive
          ? "Clear filters to see your full pipeline, or try a different search."
          : "No jobs in the pipeline yet. Create the first one to get started."}
      </p>
      {filtersActive ? (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-1.5 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
        >
          Clear filters
        </button>
      ) : (
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-1.5 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
        >
          + New Job
        </Link>
      )}
    </div>
  );
}
