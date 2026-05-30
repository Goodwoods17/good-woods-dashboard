"use client";

import { formatCAD, formatPct } from "@shared/lib/format";
import type { PnlStats } from "@features/pnl/lib/aggregate";

// Compact stat strip for the header register. Per DESIGN.md the hero KPI
// card is banned: a small label above a font-mono value, several across a
// thin register that wraps on narrow screens. The chart is the lead visual,
// these are reference numbers.
export function StatStrip({ stats }: { stats: PnlStats }) {
  const marginTone =
    stats.blendedPct >= 30
      ? "text-status-on-track"
      : stats.blendedPct >= 20
        ? "text-status-at-risk"
        : "text-status-blocked";

  return (
    <dl className="flex flex-wrap items-stretch gap-x-8 gap-y-4">
      <Stat label="Revenue" value={formatCAD(stats.totalRevenue)} />
      <Divider />
      <Stat label="Cost" value={formatCAD(stats.totalCost)} />
      <Divider />
      <Stat label="Margin" value={formatCAD(stats.totalMargin)} valueClass={marginTone} />
      <Divider />
      <Stat label="Margin %" value={formatPct(stats.blendedPct)} valueClass={marginTone} />
    </dl>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-text-primary",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-micro uppercase tracking-[0.08em] text-text-tertiary">{label}</dt>
      <dd className={`font-mono text-lg tabular-nums leading-none ${valueClass}`}>{value}</dd>
    </div>
  );
}

// Hairline separator between stats; hidden where the strip wraps so it never
// dangles at the start of a new row.
function Divider() {
  return <div aria-hidden className="hidden md:block w-px self-stretch bg-border-faint" />;
}
