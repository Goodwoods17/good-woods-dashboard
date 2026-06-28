"use client";

import { useMemo } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { computePnlStats } from "@features/pnl/lib/aggregate";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import { StatStrip } from "./StatStrip";
import { MarginChart } from "./MarginChart";
import { RevenueForecastPanel } from "./RevenueForecastPanel";
import { ReliabilityScorecardPanel } from "@features/scheduling/components/ReliabilityScorecardPanel";

export function PnlView() {
  const { jobs } = useJobs();
  const stats = useMemo(() => computePnlStats(jobs), [jobs]);
  const showForecast = schedulingP6Enabled();

  return (
    <>
      <PageHeader
        eyebrow="P&L"
        title="Profit & loss"
        subtitle="Revenue, cost, and margin across the lifetime of the dashboard."
      />
      <div className="px-4 py-6 md:px-8 max-w-7xl space-y-6">
        <StatStrip stats={stats} />
        <MarginChart series={stats.series} />
        {/* S24: Revenue forecast by committed date + buffer burn — P6 dark-ship */}
        {showForecast && <RevenueForecastPanel jobs={jobs} />}
        {/* S25: PPC + on-time delivery reliability scorecard — P6 dark-ship */}
        {showForecast && <ReliabilityScorecardPanel />}
        <p className="text-xs text-text-tertiary px-1">
          Trailing-period filters and YoY comparisons land in M7+ once you have 12+ months of
          install data flowing through the dashboard.
        </p>
      </div>
    </>
  );
}
