"use client";

// PROTOTYPE — Variant B — Cashflow-first.
// Money as the lead axis. KPI hero strip on top (this-month rev, contracted
// backlog, blended GM, cost-to-finish), then jobs grouped into month buckets
// by install date with per-bucket revenue + margin subtotals.

import { useMemo } from "react";
import Link from "next/link";
import { TrendingUp, Wallet, Package, Clock } from "lucide-react";
import { type Job, computeMargin } from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { cn } from "@shared/lib/utils";

type BucketKey = "thisMonth" | "nextMonth" | "later" | "past";

const BUCKET_ORDER: BucketKey[] = ["thisMonth", "nextMonth", "later", "past"];
const BUCKET_LABELS: Record<BucketKey, string> = {
  thisMonth: "This Month",
  nextMonth: "Next Month",
  later: "Later",
  past: "Already Installed",
};

function ymKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function bucketFor(installIso: string, today: Date): BucketKey {
  const install = new Date(installIso + "T12:00:00");
  if (install < new Date(today.getFullYear(), today.getMonth(), 1)) return "past";
  const thisYM = ymKey(today);
  const installYM = ymKey(install);
  if (installYM === thisYM) return "thisMonth";
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (installYM === ymKey(nextMonth)) return "nextMonth";
  return "later";
}

export function VariantB_Cashflow({ jobs }: { jobs: Job[] }) {
  const today = new Date();

  const { kpis, buckets } = useMemo(() => {
    const buckets: Record<BucketKey, Job[]> = {
      thisMonth: [],
      nextMonth: [],
      later: [],
      past: [],
    };

    let thisMonthRev = 0;
    let backlogRev = 0;
    let backlogCost = 0;
    let totalMargin = 0;
    let totalRev = 0;
    let costToFinish = 0;

    for (const job of jobs) {
      const m = computeMargin(job);
      const bucket = bucketFor(job.installDate, today);
      buckets[bucket].push(job);
      totalRev += job.revenue;
      totalMargin += m.marginAmount;

      const active = job.pipelineStatus !== "complete";
      if (active) {
        backlogRev += job.revenue;
        backlogCost += m.costsTotal;
        // Rough proxy: assume budget = costsTotal, costToFinish = budget − costed-so-far.
        // For prototype we treat current costs entered as already-incurred.
        costToFinish += Math.max(0, m.costsTotal); // simplification — see NOTES
      }
      if (bucket === "thisMonth" && active) thisMonthRev += job.revenue;
    }

    const blendedGm = totalRev > 0 ? (totalMargin / totalRev) * 100 : 0;

    // Sort each bucket by install date soonest-first.
    for (const k of BUCKET_ORDER) {
      buckets[k].sort((a, b) => a.installDate.localeCompare(b.installDate));
    }

    return {
      kpis: { thisMonthRev, backlogRev, blendedGm, costToFinish },
      buckets,
    };
  }, [jobs, today]);

  return (
    <div className="space-y-5">
      {/* KPI hero strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiTile
          icon={<Wallet className="h-4 w-4" strokeWidth={1.75} />}
          label="This-month installs"
          value={formatCAD(kpis.thisMonthRev)}
          sub="expected revenue recognition"
        />
        <KpiTile
          icon={<Package className="h-4 w-4" strokeWidth={1.75} />}
          label="Contracted backlog"
          value={formatCAD(kpis.backlogRev)}
          sub="all non-complete jobs"
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
          label="Blended GM"
          value={`${kpis.blendedGm.toFixed(1)}%`}
          sub="weighted across all jobs"
          tone={
            kpis.blendedGm >= 30
              ? "good"
              : kpis.blendedGm >= 20
              ? "warn"
              : "bad"
          }
        />
        <KpiTile
          icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
          label="Cost-tracked"
          value={formatCAD(kpis.costToFinish)}
          sub="cost lines entered on active jobs"
        />
      </div>

      {/* Month buckets */}
      <div className="space-y-4">
        {BUCKET_ORDER.map((key) => {
          const list = buckets[key];
          if (list.length === 0) return null;
          const sumRev = list.reduce((s, j) => s + j.revenue, 0);
          const sumMargin = list.reduce(
            (s, j) => s + computeMargin(j).marginAmount,
            0
          );
          const gm = sumRev > 0 ? (sumMargin / sumRev) * 100 : 0;
          return (
            <section
              key={key}
              className="bg-surface border border-border rounded-lg overflow-hidden"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted/60">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {BUCKET_LABELS[key]}
                  </h3>
                  <span className="text-xs text-text-tertiary tabular-nums">
                    {list.length} job{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-4 tabular-nums text-xs">
                  <span className="text-text-secondary">
                    Revenue{" "}
                    <span className="text-text-primary font-medium">
                      {formatCAD(sumRev)}
                    </span>
                  </span>
                  <span className="text-text-secondary">
                    Margin{" "}
                    <span
                      className={cn(
                        "font-medium",
                        gm >= 30
                          ? "text-status-on-track"
                          : gm >= 20
                          ? "text-status-at-risk"
                          : "text-status-blocked"
                      )}
                    >
                      {formatCAD(sumMargin)} ({gm.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              </header>
              <ul>
                {list.map((job) => {
                  const m = computeMargin(job);
                  const marginBarPct = Math.max(
                    0,
                    Math.min(50, m.marginPct)
                  ); // cap at 50% for the bar
                  return (
                    <li
                      key={job.id}
                      className="border-b border-border last:border-0"
                    >
                      <Link
                        href={`/jobs/${job.id}`}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 hover:bg-surface-muted/40 transition-colors duration-fast group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
                              {job.name}
                            </div>
                            <HealthPill status={job.healthStatus} />
                          </div>
                          <div className="text-xs text-text-tertiary mt-0.5 flex items-center gap-2">
                            <span>{job.client}</span>
                            <span>·</span>
                            <span>Installs {formatDate(job.installDate)}</span>
                          </div>
                        </div>
                        <StatusBadge status={job.pipelineStatus} />
                        <div className="w-40">
                          <div className="flex items-center justify-between text-[10px] tabular-nums text-text-tertiary mb-1">
                            <span>Margin</span>
                            <span>{m.marginPct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-base",
                                m.band === "on_track"
                                  ? "bg-status-on-track"
                                  : m.band === "at_risk"
                                  ? "bg-status-at-risk"
                                  : "bg-status-blocked"
                              )}
                              style={{ width: `${(marginBarPct / 50) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-sm font-medium text-text-primary">
                            {formatCAD(job.revenue)}
                          </div>
                          <div className="text-xs text-text-tertiary">
                            {formatCAD(m.marginAmount)} margin
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-status-on-track"
      : tone === "warn"
      ? "text-status-at-risk"
      : tone === "bad"
      ? "text-status-blocked"
      : "text-text-primary";
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-text-tertiary text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={cn("mt-2 text-2xl tabular-nums font-semibold", toneCls)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-text-tertiary">{sub}</div>
    </div>
  );
}
