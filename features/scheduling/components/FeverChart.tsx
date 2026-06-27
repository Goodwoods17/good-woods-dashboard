"use client";

import { cn } from "@shared/lib/utils";
import {
  DEFAULT_FEVER_THRESHOLDS,
  type FeverZone,
  type FeverThresholds,
} from "../lib/bufferBurn";

type FeverChartProps = {
  /** X-axis: how far through the job we are (0–100). */
  chainCompletionPct: number;
  /** Y-axis: how much of the pooled buffer has been consumed (0–100, can exceed 100). */
  bufferConsumedPct: number;
  /** Current fever zone (drives the dot colour and zone highlight). */
  zone: FeverZone;
  /** Tunable thresholds — defaults to the standard CCPM 1/3 + 2/3 ratios. */
  thresholds?: Partial<FeverThresholds>;
  className?: string;
};

const ZONE_COLORS: Record<FeverZone, { fill: string; dot: string; label: string }> = {
  green: {
    fill: "fill-emerald-500/15",
    dot: "fill-emerald-500 stroke-emerald-600",
    label: "On track",
  },
  yellow: {
    fill: "fill-amber-400/20",
    dot: "fill-amber-400 stroke-amber-500",
    label: "At risk",
  },
  red: {
    fill: "fill-rose-500/20",
    dot: "fill-rose-500 stroke-rose-600",
    label: "Danger",
  },
};

/**
 * A minimal CCPM fever chart rendered as inline SVG. No external charting
 * library needed — the zones are triangular polygons bounded by two diagonal
 * lines through the origin, which SVG handles natively.
 *
 * X-axis: chain completion % (0 → 100%)
 * Y-axis: buffer consumed % (0 → 100%)
 *
 * The two diagonal boundary lines divide the chart into three zones:
 *   GREEN  (safe):    buffer% ≤ chain% × greenYellowRatio
 *   YELLOW (warning): buffer% between the two ratios
 *   RED    (danger):  buffer% > chain% × yellowRedRatio
 *
 * Note: Y increases upward in chart space, but SVG Y increases downward, so
 * all Y coordinates are flipped: svgY = chartHeight - (pct / 100) × chartHeight.
 */
export function FeverChart({
  chainCompletionPct,
  bufferConsumedPct,
  zone,
  thresholds,
  className,
}: FeverChartProps) {
  const gy = thresholds?.greenYellowRatio ?? DEFAULT_FEVER_THRESHOLDS.greenYellowRatio;
  const yr = thresholds?.yellowRedRatio ?? DEFAULT_FEVER_THRESHOLDS.yellowRedRatio;

  // Chart area dimensions (viewBox units, arbitrary).
  const W = 200;
  const H = 150;

  // Axis tick / padding
  const PAD_LEFT = 28;
  const PAD_BOTTOM = 18;
  const CW = W - PAD_LEFT; // chart width
  const CH = H - PAD_BOTTOM; // chart height

  // The two diagonal boundary lines in chart space (x 0→100, y 0→100).
  // In SVG: originX = PAD_LEFT, originY = CH (bottom of chart).
  // A point at (xPct, yPct) maps to SVG coords:
  //   svgX = PAD_LEFT + (xPct / 100) * CW
  //   svgY = CH - (yPct / 100) * CH
  const chartX = (pct: number) => PAD_LEFT + (pct / 100) * CW;
  const chartY = (pct: number) => CH - Math.min(1.05, pct / 100) * CH; // cap slightly above chart

  // Zone polygon coordinates.
  // Origin in chart space: (0%, 0%) = (PAD_LEFT, CH) in SVG.
  const ox = PAD_LEFT;
  const oy = CH; // bottom-left

  // Green boundary line: y = x * gy → at x=100%, y_svg = CH*(1-gy)
  const gyY = CH - gy * CH;
  // Yellow/Red boundary line: y = x * yr → at x=100%, y_svg = CH*(1-yr)
  const yrY = CH - yr * CH;

  // Three triangular zone polygons covering the chart area.
  // Winding: each polygon's points in order.
  //
  // GREEN (bottom triangle): below y = x * gy
  //   (ox, oy) → (W, oy) → (W, gyY) → (ox, oy)
  const greenPoly = `${ox},${oy} ${W},${oy} ${W},${gyY} ${ox},${oy}`;

  // YELLOW (middle band): between the two diagonals
  //   (ox, oy) → (W, gyY) → (W, yrY) → (ox, oy)
  const yellowPoly = `${ox},${oy} ${W},${gyY} ${W},${yrY} ${ox},${oy}`;

  // RED (top triangle): above y = x * yr
  //   (ox, oy) → (W, yrY) → (W, 0) → (ox, 0) → (ox, oy)
  const redPoly = `${ox},${oy} ${W},${yrY} ${W},0 ${ox},0 ${ox},${oy}`;

  // Current position dot.
  const dotX = chartX(Math.min(100, chainCompletionPct));
  const dotY = chartY(bufferConsumedPct);
  const dotColors = ZONE_COLORS[zone];

  // Boundary line endpoints (for the visible diagonal guides).
  const gyLineX2 = chartX(100);
  const gyLineY2 = chartY(gy * 100);
  const yrLineX2 = chartX(100);
  const yrLineY2 = chartY(yr * 100);

  return (
    <figure
      aria-label="Buffer fever chart"
      data-testid="fever-chart"
      data-zone={zone}
      className={cn("not-prose", className)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Fever chart: ${Math.round(chainCompletionPct)}% chain complete, ${Math.round(bufferConsumedPct)}% buffer consumed — ${dotColors.label}`}
      >
        {/* Zone backgrounds */}
        <polygon points={greenPoly} className="fill-emerald-500/15" />
        <polygon points={yellowPoly} className="fill-amber-400/20" />
        <polygon points={redPoly} className="fill-rose-500/20" />

        {/* Boundary guide lines (subtle) */}
        <line
          x1={ox}
          y1={oy}
          x2={gyLineX2}
          y2={gyLineY2}
          className="stroke-emerald-600/30"
          strokeWidth="0.5"
          strokeDasharray="3 2"
        />
        <line
          x1={ox}
          y1={oy}
          x2={yrLineX2}
          y2={yrLineY2}
          className="stroke-rose-500/30"
          strokeWidth="0.5"
          strokeDasharray="3 2"
        />

        {/* Axis lines */}
        <line x1={ox} y1={0} x2={ox} y2={CH} className="stroke-border" strokeWidth="0.75" />
        <line x1={ox} y1={CH} x2={W} y2={CH} className="stroke-border" strokeWidth="0.75" />

        {/* Y-axis ticks */}
        {[0, 50, 100].map((pct) => {
          const ty = chartY(pct);
          return (
            <g key={pct}>
              <line x1={ox - 3} y1={ty} x2={ox} y2={ty} className="stroke-border" strokeWidth="0.5" />
              <text
                x={ox - 4}
                y={ty}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="6"
                className="fill-text-tertiary font-mono"
              >
                {pct}
              </text>
            </g>
          );
        })}

        {/* X-axis ticks */}
        {[0, 50, 100].map((pct) => {
          const tx = chartX(pct);
          return (
            <g key={pct}>
              <line x1={tx} y1={CH} x2={tx} y2={CH + 3} className="stroke-border" strokeWidth="0.5" />
              <text
                x={tx}
                y={CH + 9}
                textAnchor="middle"
                fontSize="6"
                className="fill-text-tertiary font-mono"
              >
                {pct}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={ox + CW / 2}
          y={H - 1}
          textAnchor="middle"
          fontSize="6.5"
          className="fill-text-secondary"
        >
          Chain complete %
        </text>
        <text
          x={6}
          y={CH / 2}
          textAnchor="middle"
          fontSize="6.5"
          transform={`rotate(-90, 6, ${CH / 2})`}
          className="fill-text-secondary"
        >
          Buffer consumed %
        </text>

        {/* Current position dot */}
        <circle
          cx={dotX}
          cy={dotY}
          r="5"
          strokeWidth="1.5"
          className={cn(dotColors.dot)}
        />
      </svg>

      {/* Zone legend */}
      <div
        className={cn(
          "mt-1 flex items-center justify-center gap-3 text-xs",
          "text-text-secondary tabular-nums"
        )}
        aria-hidden="true"
      >
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/60" />
          Safe
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400/80" />
          Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500/80" />
          Danger
        </span>
      </div>
    </figure>
  );
}
