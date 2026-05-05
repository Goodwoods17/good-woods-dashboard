"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { JobsList } from "@/components/jobs/JobsList";
import { KanbanBoard } from "@/components/jobs/KanbanBoard";
import { ViewToggle, type JobsView } from "@/components/jobs/ViewToggle";
import { PageHeader } from "@/components/layout/PageHeader";
import { useJobs } from "@/lib/jobsStore";
import { computeMargin } from "@/lib/types";
import { formatCAD, formatPct } from "@/lib/format";

const VIEW_KEY = "gw_jobs_view_v1";

export default function Home() {
  const { jobs, loading } = useJobs();
  const [view, setView] = useState<JobsView>("list");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "kanban" || saved === "list") setView(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(VIEW_KEY, view);
  }, [view, hydrated]);

  const totals = jobs.reduce(
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
  const activeCount = jobs.filter((j) => j.pipelineStatus !== "complete").length;

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Jobs"
        subtitle={
          loading
            ? "Loading…"
            : `${activeCount} active job${activeCount === 1 ? "" : "s"} · ${formatCAD(totals.revenue)} contracted · GM ${formatPct(overallPct)} blended`
        }
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            <Link
              href="/jobs/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover transition-colors duration-fast"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New Job
            </Link>
          </>
        }
      />
      <div className="px-8 py-6">
        {loading ? (
          <ListSkeleton />
        ) : view === "list" ? (
          <JobsList jobs={jobs} />
        ) : (
          <KanbanBoard jobs={jobs} />
        )}
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="border-b border-border bg-surface-muted h-10" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-border last:border-0 h-12 flex items-center px-4"
        >
          <div className="h-3 w-48 rounded bg-surface-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}
