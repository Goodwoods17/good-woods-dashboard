"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCAD } from "@shared/lib/format";
import type { MonthBucket } from "@features/pnl/lib/aggregate";
import { CHART_TOKENS } from "@features/pnl/lib/chartTokens";

export function MarginChart({ series }: { series: MonthBucket[] }) {
  return (
    <section className="bg-surface rounded-xl shadow-resting p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em]">
          Revenue, cost, margin by install month
        </h2>
        <span className="text-xs text-text-tertiary">
          {series.length} month{series.length === 1 ? "" : "s"}
        </span>
      </div>
      {series.length === 0 ? (
        <div className="text-sm text-text-tertiary py-12 text-center">
          No data yet.
        </div>
      ) : (
        <div className="h-72 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <defs>
                <linearGradient id="bar-revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_TOKENS.accent} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={CHART_TOKENS.accent} stopOpacity={0.35} />
                </linearGradient>
                <linearGradient id="bar-cost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_TOKENS.atRisk} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={CHART_TOKENS.atRisk} stopOpacity={0.30} />
                </linearGradient>
                <linearGradient id="bar-margin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_TOKENS.onTrack} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={CHART_TOKENS.onTrack} stopOpacity={0.30} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: CHART_TOKENS.textTertiary }}
                axisLine={{ stroke: CHART_TOKENS.borderFaint }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCAD(v as number)}
                tick={{ fontSize: 11, fill: CHART_TOKENS.textTertiary }}
                axisLine={{ stroke: CHART_TOKENS.borderFaint }}
                tickLine={false}
                width={70}
              />
              <Tooltip
                cursor={{ fill: CHART_TOKENS.surfaceMuted }}
                formatter={(v) => formatCAD(Number(v))}
                contentStyle={{
                  background: "#FFFFFF",
                  border: `1px solid ${CHART_TOKENS.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: CHART_TOKENS.textPrimary,
                  boxShadow: "0 8px 22px -14px rgba(26,25,22,0.18)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: CHART_TOKENS.textTertiary }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="url(#bar-revenue)"
                radius={[6, 6, 0, 0]}
                isAnimationActive
                animationBegin={0}
                animationDuration={400}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="cost"
                name="Cost"
                fill="url(#bar-cost)"
                radius={[6, 6, 0, 0]}
                isAnimationActive
                animationBegin={80}
                animationDuration={400}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="margin"
                name="Margin"
                fill="url(#bar-margin)"
                radius={[6, 6, 0, 0]}
                isAnimationActive
                animationBegin={160}
                animationDuration={400}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
