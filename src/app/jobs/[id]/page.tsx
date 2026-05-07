"use client";

import { JobDetail } from "@/components/jobs/JobDetail";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJob, useJobs } from "@/lib/jobsStore";
import Link from "next/link";

export default function JobPage({ params }: { params: { id: string } }) {
  const { loading } = useJobs();
  const job = useJob(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Job" title="Loading…" />
        <div className="px-8 py-6 max-w-4xl">
          <div className="h-8 w-72 rounded bg-surface-muted animate-pulse mb-4" />
          <div className="h-4 w-48 rounded bg-surface-muted animate-pulse mb-8" />
          <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
            <div className="h-3 w-full rounded bg-surface-muted animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-surface-muted animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-surface-muted animate-pulse" />
          </div>
        </div>
      </>
    );
  }

  if (!job) {
    return (
      <>
        <PageHeader eyebrow="Jobs" title="Job not found" />
        <div className="px-8 py-10">
          <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center max-w-xl">
            <p className="text-sm text-text-secondary mb-4">
              That job ID doesn&apos;t exist.
            </p>
            <Link
              href="/"
              className="inline-flex items-center text-sm font-medium text-accent hover:text-accent-hover transition-colors duration-fast"
            >
              ← Back to Jobs
            </Link>
          </div>
        </div>
      </>
    );
  }

  return <JobDetail jobId={job.id} />;
}
