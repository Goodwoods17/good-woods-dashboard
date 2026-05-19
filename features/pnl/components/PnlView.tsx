"use client";

import { useMemo } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { computePnlStats } from "@features/pnl/lib/aggregate";
import { StatsTiles } from "./StatsTiles";
import { MarginChart } from "./MarginChart";

export function PnlView() {
  const { jobs } = useJobs();
  const stats = useMemo(() => computePnlStats(jobs), [jobs]);

  return (
    <>
      <PageHeader
        eyebrow="P&L"
        title="Profit & loss"
        subtitle="Revenue, cost, and margin across the lifetime of the dashboard."
      />
      <div className="px-8 py-6 max-w-7xl space-y-6">
        <StatsTiles stats={stats} />
        <MarginChart series={stats.series} />
        <p className="text-xs text-text-tertiary px-1">
          Trailing-period filters and YoY comparisons land in M7+ once you have
          12+ months of install data flowing through the dashboard.
        </p>
      </div>
    </>
  );
}
