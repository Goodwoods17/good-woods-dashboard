"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { JobsList } from "@features/jobs/components/JobsList";
import { KanbanBoard } from "@features/jobs/components/KanbanBoard";
import { ViewToggle, type JobsView } from "@features/jobs/components/ViewToggle";
import { BriefingCard } from "@features/briefing/components/BriefingCard";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { computeMargin } from "@shared/lib/types";
import { formatCAD, formatPct } from "@shared/lib/format";
// PROTOTYPE — swap these out (and the ?variant= block below) when a winner is picked.
import { VariantA_Schedule } from "@features/jobs/prototype/VariantA_Schedule";
import { VariantB_Cashflow } from "@features/jobs/prototype/VariantB_Cashflow";
import { VariantC_Funnel } from "@features/jobs/prototype/VariantC_Funnel";
import { PrototypeSwitcher } from "@features/jobs/prototype/PrototypeSwitcher";

const VIEW_KEY = "gw_jobs_view_v1";

// Wrapping in Suspense is required for useSearchParams() to prerender at
// build time on Next.js 14 App Router. Without it the `/` route fails to
// export and ships as a runtime-error page.
export default function Home() {
  return (
    <Suspense fallback={<HomeShell loading />}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { jobs, loading } = useJobs();
  const [view, setView] = useState<JobsView>("list");
  const [hydrated, setHydrated] = useState(false);
  const searchParams = useSearchParams();
  const variantParam = searchParams.get("variant");
  const variant: "A" | "B" | "C" | null =
    variantParam === "A" || variantParam === "B" || variantParam === "C"
      ? variantParam
      : null;

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
        eyebrow={variant ? `Prototype · Variant ${variant}` : "Pipeline"}
        title="Jobs"
        subtitle={
          loading
            ? "Loading…"
            : `${activeCount} active job${activeCount === 1 ? "" : "s"} · ${formatCAD(totals.revenue)} contracted · GM ${formatPct(overallPct)} blended`
        }
        actions={
          <>
            {!variant && <ViewToggle view={view} onChange={setView} />}
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
      <div className="px-8 pt-5">
        <BriefingCard />
      </div>
      <div className="px-8 pb-6 pt-1">
        {loading ? (
          <ListSkeleton />
        ) : variant === "A" ? (
          <VariantA_Schedule jobs={jobs} />
        ) : variant === "B" ? (
          <VariantB_Cashflow jobs={jobs} />
        ) : variant === "C" ? (
          <VariantC_Funnel jobs={jobs} />
        ) : view === "list" ? (
          <JobsList jobs={jobs} />
        ) : (
          <KanbanBoard jobs={jobs} />
        )}
      </div>
      <PrototypeSwitcher />
    </>
  );
}

function HomeShell({ loading }: { loading?: boolean }) {
  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Jobs"
        subtitle={loading ? "Loading…" : ""}
      />
      <div className="px-8 py-6">
        <ListSkeleton />
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
