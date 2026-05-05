"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Calendar as CalendarIcon } from "lucide-react";
import type { Job } from "@/lib/types";
import { computeMargin } from "@/lib/types";
import { formatCAD, formatDate, formatPct } from "@/lib/format";
import { HealthPill } from "@/components/ui/HealthPill";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MilestonesStrip } from "./MilestonesStrip";
import { CostsTab } from "./CostsTab";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "tasks" | "files" | "costs";

const TABS: { key: TabKey; label: string; enabled: boolean }[] = [
  { key: "overview", label: "Overview", enabled: false },
  { key: "tasks", label: "Tasks", enabled: false },
  { key: "files", label: "Files", enabled: false },
  { key: "costs", label: "Costs", enabled: true },
];

export function JobDetail({ initialJob }: { initialJob: Job }) {
  const [job, setJob] = useState<Job>(initialJob);
  const [activeTab, setActiveTab] = useState<TabKey>("costs");

  const margin = computeMargin(job);
  const marginToneText =
    margin.band === "on_track"
      ? "text-status-on-track"
      : margin.band === "at_risk"
        ? "text-status-at-risk"
        : "text-status-blocked";

  return (
    <div className="flex flex-col">
      <header className="border-b border-border bg-surface px-8 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to Jobs
        </Link>

        <div className="flex items-start justify-between gap-6 mb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xs tabular-nums text-text-tertiary uppercase tracking-wider">
                {job.code}
              </span>
              <StatusBadge status={job.pipelineStatus} />
              <HealthPill status={job.healthStatus} />
            </div>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">
              {job.name}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
              <span>{job.client}</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
                {job.address}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
                Install {formatDate(job.installDate)}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right border-l border-border pl-6">
            <div className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary mb-1">
              Gross margin
            </div>
            <div className={cn("text-2xl font-semibold tabular-nums", marginToneText)}>
              {formatPct(margin.marginPct)}
            </div>
            <div className="text-xs text-text-tertiary tabular-nums mt-0.5">
              {formatCAD(margin.marginAmount)} on {formatCAD(job.revenue)}
            </div>
          </div>
        </div>

        <MilestonesStrip current={job.currentMilestone} />
      </header>

      <nav className="border-b border-border bg-surface px-8">
        <div className="flex items-center gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => tab.enabled && setActiveTab(tab.key)}
              disabled={!tab.enabled}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-fast",
                activeTab === tab.key
                  ? "border-accent text-accent"
                  : tab.enabled
                    ? "border-transparent text-text-secondary hover:text-text-primary"
                    : "border-transparent text-text-disabled cursor-not-allowed"
              )}
            >
              {tab.label}
              {!tab.enabled && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wider text-text-tertiary">
                  M2
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 px-8 py-6">
        {activeTab === "costs" && <CostsTab job={job} onChange={setJob} />}
      </div>
    </div>
  );
}
