"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { formatCAD, formatPct } from "@shared/lib/format";
import type { PnlStats } from "@features/pnl/lib/aggregate";
import { Tile } from "./Tile";

export function StatsTiles({ stats }: { stats: PnlStats }) {
  const tone =
    stats.blendedPct >= 30
      ? "text-status-on-track"
      : stats.blendedPct >= 20
        ? "text-status-at-risk"
        : "text-status-blocked";

  return (
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
  );
}
