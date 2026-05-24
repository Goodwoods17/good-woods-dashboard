"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  type Job,
  type PipelineStatus,
  PIPELINE_LABELS,
  computeMargin,
} from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";
import { MarginCell } from "@shared/components/ui/MarginCell";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { cn } from "@shared/lib/utils";

const TOKEN = {
  accent: "#B86F52",
  accentDeep: "#8F4F36",
  accentSoft: "#F2E4DC",
  border: "#E2DFD9",
  borderFaint: "#ECE9E4",
  surfaceMuted: "#F4F2EE",
  textPrimary: "#1A1916",
  textTertiary: "#8B8782",
  onTrack: "#6B8E5C",
  atRisk: "#C99846",
  blocked: "#B5544C",
  paused: "#9A968D",
};

const PIPELINE_ORDER: PipelineStatus[] = [
  "new",
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

export function ReportsView({ jobs }: { jobs: Job[] }) {
  const stats = useMemo(() => {
    const closedJobs = jobs.filter((j) => j.pipelineStatus === "complete");
    const activeJobs = jobs.filter((j) => j.pipelineStatus !== "complete");

    const closedRevenue = closedJobs.reduce((s, j) => s + j.revenue, 0);
    const closedMargin = closedJobs.reduce(
      (s, j) => s + computeMargin(j).marginAmount,
      0
    );
    const trailingGmPct = closedRevenue > 0 ? (closedMargin / closedRevenue) * 100 : 0;

    const activeRevenue = activeJobs.reduce((s, j) => s + j.revenue, 0);
    const activeMargin = activeJobs.reduce(
      (s, j) => s + computeMargin(j).marginAmount,
      0
    );
    const activeGmPct = activeRevenue > 0 ? (activeMargin / activeRevenue) * 100 : 0;

    const byStage = PIPELINE_ORDER.map((stage) => {
      const stageJobs = jobs.filter((j) => j.pipelineStatus === stage);
      return {
        stage,
        label: PIPELINE_LABELS[stage],
        count: stageJobs.length,
        value: stageJobs.reduce((s, j) => s + j.revenue, 0),
      };
    }).filter((s) => s.count > 0);

    const byJob = [...jobs]
      .map((j) => ({ job: j, margin: computeMargin(j) }))
      .sort((a, b) => b.margin.marginAmount - a.margin.marginAmount);

    return {
      trailingGmPct,
      closedRevenue,
      closedCount: closedJobs.length,
      activeRevenue,
      activeGmPct,
      activeCount: activeJobs.length,
      byStage,
      byJob,
    };
  }, [jobs]);

  const trailingBand =
    stats.trailingGmPct >= 30
      ? "text-status-on-track"
      : stats.trailingGmPct >= 20
        ? "text-status-at-risk"
        : "text-status-blocked";

  return (
    <div className="space-y-6 max-w-7xl">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile
          label="Trailing GM%"
          value={formatPct(stats.trailingGmPct)}
          sub={`${stats.closedCount} closed · ${formatCAD(stats.closedRevenue)} revenue`}
          valueClass={trailingBand}
        />
        <KpiTile
          label="Active pipeline"
          value={formatCAD(stats.activeRevenue)}
          sub={`${stats.activeCount} job${stats.activeCount === 1 ? "" : "s"} · projected GM ${formatPct(stats.activeGmPct)}`}
        />
        <KpiTile
          label="Total jobs"
          value={String(jobs.length)}
          sub="All time (M2 will window to trailing 90 days)"
          valueClass="text-text-primary"
        />
      </section>

      <section className="bg-surface rounded-xl shadow-resting p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em]">
            Pipeline value by stage
          </h2>
          <span className="text-xs text-text-tertiary tabular-nums">
            {formatCAD(stats.byStage.reduce((s, x) => s + x.value, 0))} total
          </span>
        </div>
        {stats.byStage.length === 0 ? (
          <div className="text-sm text-text-tertiary py-12 text-center">
            No pipeline data yet.
          </div>
        ) : (
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byStage} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="pipeline-active" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TOKEN.accent} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={TOKEN.accent} stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="pipeline-complete" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TOKEN.onTrack} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={TOKEN.onTrack} stopOpacity={0.30} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: TOKEN.textTertiary }}
                  axisLine={{ stroke: TOKEN.borderFaint }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCAD(v as number)}
                  tick={{ fontSize: 11, fill: TOKEN.textTertiary }}
                  axisLine={{ stroke: TOKEN.borderFaint }}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: TOKEN.surfaceMuted }}
                  formatter={(v) => [formatCAD(Number(v)), "Pipeline value"]}
                  contentStyle={{
                    background: "#FFFFFF",
                    border: `1px solid ${TOKEN.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: TOKEN.textPrimary,
                    boxShadow: "0 8px 22px -14px rgba(26,25,22,0.18)",
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive
                  animationBegin={0}
                  animationDuration={400}
                  animationEasing="ease-out"
                >
                  {stats.byStage.map((entry) => (
                    <Cell
                      key={entry.stage}
                      fill={
                        entry.stage === "complete"
                          ? "url(#pipeline-complete)"
                          : "url(#pipeline-active)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-surface rounded-xl shadow-resting overflow-hidden">
        <div className="px-5 py-4 border-b border-border-faint">
          <h2 className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em]">
            Margin by job, high to low
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Job
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Health
              </th>
              <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Revenue
              </th>
              <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Cost
              </th>
              <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Margin $
              </th>
              <th className="text-right px-5 py-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                GM %
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.byJob.map(({ job, margin }) => (
              <tr
                key={job.id}
                className="border-b border-border last:border-0 hover:bg-surface-muted/40 transition-colors duration-fast"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="block group"
                  >
                    <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors duration-fast">
                      {job.name}
                    </div>
                    <div className="text-xs text-text-tertiary tabular-nums">
                      {job.code} · {job.client}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <HealthPill status={job.healthStatus} />
                </td>
                <td className={cn("px-4 py-3 text-right tabular-nums text-text-primary")}>
                  {formatCAD(job.revenue)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {formatCAD(margin.costsTotal)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-text-primary font-medium">
                  {formatCAD(margin.marginAmount)}
                </td>
                <td className="px-5 py-3 text-right">
                  <MarginCell margin={margin} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2">
        {label}
      </div>
      <div className={cn("text-3xl font-semibold tabular-nums", valueClass ?? "text-text-primary")}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-text-tertiary mt-2 leading-relaxed">{sub}</div>
      )}
    </div>
  );
}
