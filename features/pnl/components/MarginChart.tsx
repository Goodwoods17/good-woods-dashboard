"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCAD, formatPct } from "@shared/lib/format";
import type { MonthBucket } from "@features/pnl/lib/aggregate";
import { PALETTE } from "@shared/lib/chartPalette";

type MarginPoint = MonthBucket & { marginPct: number };

export function MarginChart({ series }: { series: MonthBucket[] }) {
  const points: MarginPoint[] = series.map((m) => ({
    ...m,
    marginPct: m.revenue > 0 ? (m.margin / m.revenue) * 100 : 0,
  }));

  const lastIdx = points.length - 1;
  const latestRevenue = points[lastIdx]?.revenue ?? 0;
  const latestCost = points[lastIdx]?.cost ?? 0;

  return (
    <section className="bg-surface rounded-2xl shadow-resting p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="font-serif text-title font-medium text-text-primary">Margin over time</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Gross margin percentage by install month.
          </p>
        </div>
        <span className="shrink-0 text-xs text-text-tertiary tabular-nums">
          {series.length} month{series.length === 1 ? "" : "s"}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="text-sm text-text-tertiary py-16 text-center">No data yet.</div>
      ) : (
        <>
          <div className="h-64 md:h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={PALETTE.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: PALETTE.textTertiary }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  hide
                  domain={[
                    (dataMin: number) => Math.min(0, Math.floor(dataMin - 5)),
                    (dataMax: number) => Math.max(60, Math.ceil(dataMax + 5)),
                  ]}
                />
                <Tooltip
                  cursor={{
                    stroke: PALETTE.borderFaint,
                    strokeWidth: 1,
                  }}
                  formatter={(v) => [formatPct(Number(v)), "Margin"]}
                  contentStyle={{
                    background: "#FFFFFF",
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: PALETTE.textPrimary,
                    boxShadow: "0 8px 22px -14px rgba(26,25,22,0.18)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="marginPct"
                  stroke={PALETTE.accentActive}
                  strokeWidth={1.5}
                  fill="url(#marginGradient)"
                  isAnimationActive
                  animationDuration={400}
                  animationEasing="ease-out"
                  dot={(props) => {
                    const { cx, cy, index } = props as {
                      cx: number;
                      cy: number;
                      index: number;
                    };
                    if (index !== lastIdx) {
                      // Recharts requires an SVG element return, not null —
                      // emit a zero-radius circle for non-endpoint indices.
                      return (
                        <circle key={`dot-${index}`} cx={cx} cy={cy} r={0} fill="transparent" />
                      );
                    }
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill={PALETTE.accentActive}
                      />
                    );
                  }}
                  activeDot={{
                    r: 3,
                    fill: PALETTE.accentActive,
                    stroke: PALETTE.accentActive,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 pt-4 border-t border-border-faint space-y-3">
            <SparklineRow
              label="Revenue"
              points={points.map((p) => p.revenue)}
              latestValue={formatCAD(latestRevenue)}
            />
            <SparklineRow
              label="Cost"
              points={points.map((p) => p.cost)}
              latestValue={formatCAD(latestCost)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function SparklineRow({
  label,
  points,
  latestValue,
}: {
  label: string;
  points: number[];
  latestValue: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-16 shrink-0 text-label uppercase text-text-tertiary">{label}</span>
      <div className="flex-1 min-w-0">
        <Sparkline values={points} />
      </div>
      <span className="w-24 text-right text-xs text-text-secondary font-mono tabular-nums">
        {latestValue}
      </span>
    </div>
  );
}

// Inline SVG sparkline — single hairline stroke, no fill. Kept lightweight
// on purpose so the eye reads it as a reference rail, not a focal chart.
function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;

  const width = 100;
  const height = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-[18px]"
      role="img"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={PALETTE.textSecondary}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
