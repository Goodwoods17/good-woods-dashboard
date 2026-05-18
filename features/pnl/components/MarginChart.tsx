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
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">
          Revenue / cost / margin by install month
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
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: CHART_TOKENS.textTertiary }}
                axisLine={{ stroke: CHART_TOKENS.border }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCAD(v as number)}
                tick={{ fontSize: 11, fill: CHART_TOKENS.textTertiary }}
                axisLine={{ stroke: CHART_TOKENS.border }}
                tickLine={false}
                width={70}
              />
              <Tooltip
                cursor={{ fill: CHART_TOKENS.surfaceMuted }}
                formatter={(v) => formatCAD(Number(v))}
                contentStyle={{
                  background: "#FFFFFF",
                  border: `1px solid ${CHART_TOKENS.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: CHART_TOKENS.textPrimary,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Revenue" fill={CHART_TOKENS.accent} radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="Cost" fill={CHART_TOKENS.atRisk} radius={[4, 4, 0, 0]} />
              <Bar dataKey="margin" name="Margin" fill={CHART_TOKENS.onTrack} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
