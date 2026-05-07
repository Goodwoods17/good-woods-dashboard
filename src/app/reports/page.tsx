"use client";

import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { ReportsView } from "@features/reports/components/ReportsView";

export default function ReportsPage() {
  const { jobs, loading } = useJobs();

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Margin & pipeline"
        subtitle="Trailing performance, pipeline value, and per-job margins."
      />
      <div className="px-8 py-6">
        {loading ? (
          <div className="bg-surface border border-border rounded-lg h-64 animate-pulse" />
        ) : (
          <ReportsView jobs={jobs} />
        )}
      </div>
    </>
  );
}
