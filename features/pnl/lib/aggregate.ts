import { computeMargin, type Job } from "@shared/lib/types";

export type MonthBucket = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
  jobs: number;
};

export type PnlStats = {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  blendedPct: number;
  series: MonthBucket[];
  jobCount: number;
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

// Aggregate jobs into a P&L view:
// - totals across all jobs (revenue / cost / margin / blended GM%)
// - monthly time series (sorted ascending by install month)
export function computePnlStats(jobs: Job[]): PnlStats {
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
    const existing =
      months.get(key) ?? {
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
}
