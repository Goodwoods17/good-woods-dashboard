import { JobsList } from "@/components/jobs/JobsList";
import { PageHeader } from "@/components/layout/PageHeader";
import { SEED_JOBS } from "@/lib/jobs";
import { computeMargin } from "@/lib/types";
import { formatCAD, formatPct } from "@/lib/format";

export default function Home() {
  const totals = SEED_JOBS.reduce(
    (acc, job) => {
      const m = computeMargin(job);
      acc.revenue += job.revenue;
      acc.cost += m.costsTotal;
      acc.margin += m.marginAmount;
      return acc;
    },
    { revenue: 0, cost: 0, margin: 0 }
  );
  const overallPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;
  const activeCount = SEED_JOBS.filter((j) => j.pipelineStatus !== "complete").length;

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Jobs"
        subtitle={`${activeCount} active job${activeCount === 1 ? "" : "s"} · ${formatCAD(totals.revenue)} contracted · GM ${formatPct(overallPct)} blended`}
      />
      <div className="px-8 py-6">
        <JobsList jobs={SEED_JOBS} />
      </div>
    </>
  );
}
