"use client";

// PROTOTYPE — Variant C — WIP / Funnel.
// Process stage occupancy as the lead axis. Stage chart on top shows $ and
// job count per pipeline stage as a bar (height proportional to revenue in
// stage). Click a stage to expand the jobs in that stage inline below.

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

const STAGES: PipelineStatus[] = [
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

export function VariantC_Funnel({ jobs }: { jobs: Job[] }) {
  // Group jobs by stage.
  const byStage = useMemo(() => {
    const map = new Map<PipelineStatus, Job[]>();
    STAGES.forEach((s) => map.set(s, []));
    for (const job of jobs) {
      const arr = map.get(job.pipelineStatus);
      if (arr) arr.push(job);
    }
    return map;
  }, [jobs]);

  // Per-stage totals.
  const stats = useMemo(() => {
    return STAGES.map((s) => {
      const list = byStage.get(s) ?? [];
      const rev = list.reduce((sum, j) => sum + j.revenue, 0);
      const margin = list.reduce(
        (sum, j) => sum + computeMargin(j).marginAmount,
        0
      );
      const blocked = list.filter((j) => j.healthStatus === "blocked").length;
      const atRisk = list.filter((j) => j.healthStatus === "at_risk").length;
      return { stage: s, count: list.length, rev, margin, blocked, atRisk };
    });
  }, [byStage]);

  const maxRev = Math.max(1, ...stats.map((s) => s.rev));

  // Default to whichever active stage holds the most $.
  const [selected, setSelected] = useState<PipelineStatus>(() => {
    const active = stats.filter((s) => s.stage !== "complete");
    const top = active.reduce(
      (best, s) => (s.rev > best.rev ? s : best),
      active[0]
    );
    return top?.stage ?? "in_production";
  });

  const selectedList = byStage.get(selected) ?? [];
  const selectedStat = stats.find((s) => s.stage === selected)!;

  return (
    <div className="space-y-5">
      {/* Stage chart */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-end justify-between gap-2 h-44">
          {stats.map((stat) => {
            const heightPct = (stat.rev / maxRev) * 100;
            const isSelected = stat.stage === selected;
            const hasIssues = stat.blocked > 0 || stat.atRisk > 0;
            return (
              <button
                key={stat.stage}
                onClick={() => setSelected(stat.stage)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-end h-full group focus:outline-none",
                  "transition-opacity duration-fast",
                  selected !== stat.stage && "opacity-80 hover:opacity-100"
                )}
              >
                <div className="text-[10px] tabular-nums text-text-tertiary mb-1">
                  {formatCAD(stat.rev)}
                </div>
                <div
                  className={cn(
                    "w-full rounded-t-md border-x border-t transition-all duration-base",
                    isSelected
                      ? "bg-accent border-accent"
                      : stat.stage === "complete"
                      ? "bg-status-paused/40 border-status-paused/40 group-hover:bg-status-paused/60"
                      : hasIssues
                      ? "bg-status-at-risk/40 border-status-at-risk/40 group-hover:bg-status-at-risk/60"
                      : "bg-accent-soft border-accent-soft group-hover:bg-accent/60"
                  )}
                  style={{ height: `${Math.max(4, heightPct)}%` }}
                />
              </button>
            );
          })}
        </div>
        {/* Axis labels */}
        <div className="flex items-start justify-between gap-2 mt-3 pt-3 border-t border-border">
          {stats.map((stat) => {
            const isSelected = stat.stage === selected;
            return (
              <button
                key={stat.stage}
                onClick={() => setSelected(stat.stage)}
                className={cn(
                  "flex-1 px-2 py-1 rounded-md text-center transition-colors duration-fast",
                  isSelected
                    ? "bg-accent-soft"
                    : "hover:bg-surface-muted"
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium",
                    isSelected ? "text-accent" : "text-text-primary"
                  )}
                >
                  {PIPELINE_LABELS[stat.stage]}
                </div>
                <div className="text-[11px] tabular-nums text-text-tertiary mt-0.5">
                  {stat.count} job{stat.count === 1 ? "" : "s"}
                </div>
                {(stat.blocked > 0 || stat.atRisk > 0) && (
                  <div className="text-[10px] mt-1 flex items-center justify-center gap-1.5">
                    {stat.blocked > 0 && (
                      <span className="flex items-center gap-0.5 text-status-blocked">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-blocked" />
                        {stat.blocked}
                      </span>
                    )}
                    {stat.atRisk > 0 && (
                      <span className="flex items-center gap-0.5 text-status-at-risk">
                        <span className="h-1.5 w-1.5 rounded-full bg-status-at-risk" />
                        {stat.atRisk}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-stage drill down */}
      <section className="bg-surface border border-border rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-border bg-surface-muted/60 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {PIPELINE_LABELS[selected]}
            </h3>
            <span className="text-xs text-text-tertiary tabular-nums">
              {selectedStat.count} job{selectedStat.count === 1 ? "" : "s"} ·{" "}
              {formatCAD(selectedStat.rev)} contracted
            </span>
          </div>
        </header>
        {selectedList.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-secondary">
            Nothing sitting in this stage right now.
          </div>
        ) : (
          <ul>
            {selectedList.map((job) => {
              const m = computeMargin(job);
              return (
                <li key={job.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-muted/40 transition-colors duration-fast group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
                          {job.name}
                        </div>
                        <HealthPill status={job.healthStatus} />
                      </div>
                      <div className="text-xs text-text-tertiary mt-0.5">
                        {job.client} · Installs {formatDate(job.installDate)} ·{" "}
                        {job.code}
                      </div>
                    </div>
                    <div className="text-right tabular-nums text-xs">
                      <div className="text-sm font-medium text-text-primary">
                        {formatCAD(job.revenue)}
                      </div>
                      <div
                        className={cn(
                          m.band === "on_track"
                            ? "text-status-on-track"
                            : m.band === "at_risk"
                            ? "text-status-at-risk"
                            : "text-status-blocked"
                        )}
                      >
                        {m.marginPct.toFixed(1)}% margin
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-text-tertiary px-1">
        Bar height = revenue sitting in that stage. Bars turn amber when any
        job in the stage is at-risk or blocked. Click a stage to drill in.
        v2 would add average days-in-stage to show real bottlenecks.
      </p>
    </div>
  );
}
