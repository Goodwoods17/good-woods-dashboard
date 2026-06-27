"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { JobsList } from "@features/jobs/components/JobsList";
import { KanbanBoard } from "@features/jobs/components/KanbanBoard";
import { Hitlist } from "@features/jobs/components/Hitlist";
import { Schedule } from "@features/jobs/components/Schedule";
import { ViewToggle, type JobsView } from "@features/jobs/components/ViewToggle";
import { BriefingCard } from "@features/briefing/components/BriefingCard";
import { FeverHitlist } from "@features/scheduling/components/FeverHitlist";
import { schedulingEnabled } from "@features/scheduling/lib/featureFlag";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { computeMargin } from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";

const VIEW_KEY = "gw_jobs_view_v1";
const DEFAULT_VIEW: JobsView = "hitlist";
const BASE_VIEWS: JobsView[] = ["hitlist", "schedule", "list", "kanban"];

function buildAvailableViews(): JobsView[] {
  if (schedulingEnabled()) return [...BASE_VIEWS, "fever"];
  return BASE_VIEWS;
}

function isView(v: string | null, available: JobsView[]): v is JobsView {
  return v !== null && (available as string[]).includes(v);
}

export default function Home() {
  const { jobs, loading } = useJobs();
  const [view, setView] = useState<JobsView>(DEFAULT_VIEW);
  const [hydrated, setHydrated] = useState(false);

  const availableViews = useMemo(() => buildAvailableViews(), []);

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (isView(saved, availableViews)) setView(saved);
    setHydrated(true);
  }, [availableViews]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(VIEW_KEY, view);
  }, [view, hydrated]);

  // Pipeline shows current/active work only. The full archive lives at
  // /projects (sidebar > Sell & Plan > Projects).
  const activeJobs = jobs.filter((j) => j.pipelineStatus !== "complete");
  const totals = activeJobs.reduce(
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

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={
          loading
            ? "Loading"
            : `${activeJobs.length} active . ${formatCAD(totals.revenue)} contracted . GM ${formatPct(overallPct)} blended`
        }
        actions={
          <>
            <ViewToggle view={view} onChange={setView} views={availableViews} />
            <Link
              href="/jobs/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-1.5 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New project
            </Link>
          </>
        }
      />
      <div className="px-8 pt-5">
        <BriefingCard />
      </div>
      <div className="px-8 pb-6 pt-1">
        {loading ? (
          <ListSkeleton />
        ) : view === "fever" ? (
          <FeverHitlist jobs={activeJobs} />
        ) : view === "hitlist" ? (
          <Hitlist jobs={activeJobs} />
        ) : view === "schedule" ? (
          <Schedule jobs={activeJobs} />
        ) : view === "list" ? (
          <JobsList jobs={activeJobs} />
        ) : (
          <KanbanBoard jobs={activeJobs} />
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
