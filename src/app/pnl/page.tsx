"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { computeMargin } from "@/lib/types";
import { formatCAD, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const TOKEN = {
  accent: "#B86F52",
  border: "#E8E4DD",
  surfaceMuted: "#F4F2EE",
  textPrimary: "#2B2926",
  textTertiary: "#9A968D",
  onTrack: "#6B8E5C",
  atRisk: "#C99846",
  blocked: "#B5544C",
};

type MonthBucket = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
  jobs: number;
};

function bucketByMonth(installDate: string): { key: string; label: string } {
  const d = new Date(installDate + "T12:00:00");
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("en-CA", {
    month: "short",
    year: "2-digit",
  });
  return { key, label };
}

export default function PnlPage() {
  const { jobs } = useJobs();

  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalMargin = 0;
    const months = new Map<string, MonthBucket>();

    for (const j of jobs) {
      const m = computeMargin(j);
      totalRevenue += j.revenue;
      totalCost += m.costsTotal;
      totalMargin += m.marginAmount;

      const { key, label } = bucketByMonth(j.installDate);
      const existing = months.get(key) ?? {
        key,
        label,
        revenue: 0,
        cost: 0,
        margin: 0,
        jobs: 0,
      };
      existing.revenue += j.revenue;
      existing.cost += m.costsTotal;
      existing.margin += m.marginAmount;
      existing.jobs += 1;
      months.set(key, existing);
    }

    const series = Array.from(months.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    const blendedPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalMargin,
      blendedPct,
      series,
      jobCount: jobs.length,
    };
  }, [jobs]);

  const tone =
    stats.blendedPct >= 30
      ? "text-status-on-track"
      : stats.blendedPct >= 20
        ? "text-status-at-risk"
        : "text-status-blocked";

  return (
    <>
      <PageHeader
        eyebrow="P&L"
        title="Profit & loss"
        subtitle="Revenue, cost, and margin across the lifetime of the dashboard."
      />
      <div className="px-8 py-6 max-w-7xl space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile label="Lifetime revenue" value={formatCAD(stats.totalRevenue)} />
          <Tile
            label="Lifetime cost"
            value={formatCAD(stats.totalCost)}
            sub={`${stats.jobCount} job${stats.jobCount === 1 ? "" : "s"}`}
          />
          <Tile
            label="Gross margin"
            value={formatCAD(stats.totalMargin)}
            sub={`${formatPct(stats.blendedPct)} blended`}
            valueClass={tone}
            icon={
              stats.blendedPct >= 30 ? (
                <TrendingUp className="h-4 w-4 text-status-on-track" />
              ) : (
                <TrendingDown className="h-4 w-4 text-status-at-risk" />
              )
            }
          />
          <Tile
            label="Avg job revenue"
            value={
              stats.jobCount > 0
                ? formatCAD(stats.totalRevenue / stats.jobCount)
                : "—"
            }
          />
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Revenue / cost / margin by install month
            </h2>
            <span className="text-xs text-text-tertiary">
              {stats.series.length} month{stats.series.length === 1 ? "" : "s"}
            </span>
          </div>
          {stats.series.length === 0 ? (
            <div className="text-sm text-text-tertiary py-12 text-center">
              No data yet.
            </div>
          ) : (
            <div className="h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.series}
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: TOKEN.textTertiary }}
                    axisLine={{ stroke: TOKEN.border }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCAD(v as number)}
                    tick={{ fontSize: 11, fill: TOKEN.textTertiary }}
                    axisLine={{ stroke: TOKEN.border }}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    cursor={{ fill: TOKEN.surfaceMuted }}
                    formatter={(v) => formatCAD(Number(v))}
                    contentStyle={{
                      background: "#FFFFFF",
                      border: `1px solid ${TOKEN.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      color: TOKEN.textPrimary,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={TOKEN.accent} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Cost" fill={TOKEN.atRisk} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="margin" name="Margin" fill={TOKEN.onTrack} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <p className="text-xs text-text-tertiary px-1">
          Trailing-period filters and YoY comparisons land in M7+ once you
          have 12+ months of install data flowing through the dashboard.
        </p>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-2 flex items-center gap-2">
        {label}
        {icon}
      </div>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          valueClass ?? "text-text-primary"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-text-tertiary mt-1.5">{sub}</div>
      )}
    </div>
  );
}
