"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Calendar as CalendarIcon,
  CalendarPlus,
  Pause,
  Play,
} from "lucide-react";
import { downloadJobICS } from "@features/jobs/lib/ics";
import {
  computeMargin,
  MILESTONE_STAGES,
  PIPELINE_LABELS,
  type JobBlocker,
  type MilestoneStage,
  type PipelineStatus,
} from "@shared/lib/types";
import { useJob, useJobs } from "@features/jobs/lib/jobsStore";
import { deriveHealth } from "@features/jobs/lib/health";
import { useJobBlockers } from "@features/jobs/lib/jobBlockersStore";
import { phaseGatingBlocker, partyLabel } from "@features/jobs/lib/jobBlockers";
import { useContacts } from "@features/contacts/lib/contactsStore";
import { formatCAD, formatDate, formatPct } from "@shared/lib/format";
import { DrawingsButton } from "@shared/components/ui/DrawingsButton";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { StatusEditor } from "@shared/components/ui/StatusEditor";
import { MilestonesStrip } from "./MilestonesStrip";
import { ScheduleTimeline } from "@features/scheduling/components/ScheduleTimeline";
import { GanttSchedule } from "@features/scheduling/components/GanttSchedule";
import { BlockersCard } from "./BlockersCard";
import { CostsTab } from "./CostsTab";
import { OverviewTab } from "./OverviewTab";
import { ActivityTab } from "./ActivityTab";
import { TasksTab } from "./TasksTab";
import { BudgetVsActualTab } from "@features/job-costing/components/BudgetVsActualTab";
import { JobFormsTab } from "@features/forms/components/JobFormsTab";
import { cn } from "@shared/lib/utils";

const PIPELINE_OPTIONS: PipelineStatus[] = [
  "new",
  "sold",
  "in_design",
  "in_production",
  "in_finishing",
  "installing",
  "complete",
];

type TabKey = "overview" | "tasks" | "forms" | "files" | "costs" | "activity" | "budget";

const TABS: { key: TabKey; label: string; enabled: boolean }[] = [
  { key: "overview", label: "Overview", enabled: true },
  { key: "costs", label: "Costs", enabled: true },
  { key: "budget", label: "Budget vs Actual", enabled: true },
  { key: "tasks", label: "Tasks", enabled: true },
  { key: "forms", label: "Forms", enabled: true },
  { key: "activity", label: "Activity", enabled: true },
  { key: "files", label: "Files", enabled: false },
];

export function JobDetail({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const { updateJob } = useJobs();
  const { activeByJob, activeForJob } = useJobBlockers();
  const { contacts } = useContacts();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [pendingStage, setPendingStage] = useState<MilestoneStage | null>(null);
  const [gatingBlocker, setGatingBlocker] = useState<JobBlocker | null>(null);

  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;
  const stageLabel = (s: MilestoneStage) => MILESTONE_STAGES.find((m) => m.key === s)?.label ?? s;

  if (!job) return null;
  const margin = computeMargin(job);
  const marginToneText =
    margin.band === "on_track"
      ? "text-status-on-track"
      : margin.band === "at_risk"
        ? "text-status-at-risk"
        : "text-status-blocked";
  const derivedHealth = deriveHealth(job, new Date(), activeByJob.get(job.id) ?? []);
  const isPaused = job.healthStatus === "paused";

  return (
    <div className="flex flex-col">
      <header className="border-b border-border bg-surface px-8 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to Pipeline
        </Link>

        <div className="flex items-start justify-between gap-6 mb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xs tabular-nums text-text-tertiary uppercase tracking-wider">
                {job.code}
              </span>
              <StatusEditor
                value={job.pipelineStatus}
                options={PIPELINE_OPTIONS.map((s) => ({
                  value: s,
                  label: PIPELINE_LABELS[s],
                }))}
                onChange={(next) => updateJob(job.id, { pipelineStatus: next })}
                trigger={<StatusBadge status={job.pipelineStatus} />}
              />
              <HealthPill status={derivedHealth} />
              <button
                type="button"
                onClick={() =>
                  updateJob(job.id, {
                    healthStatus: isPaused ? "on_track" : "paused",
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label font-medium",
                  "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong",
                  "transition-colors duration-fast"
                )}
                title={
                  isPaused
                    ? "Resume — health goes back to deriving from schedule"
                    : "Pause — health stays paused regardless of schedule"
                }
                aria-pressed={isPaused}
              >
                {isPaused ? (
                  <>
                    <Play className="h-3 w-3" strokeWidth={1.75} />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3" strokeWidth={1.75} />
                    Pause
                  </>
                )}
              </button>
            </div>
            <h1 className="font-serif text-headline font-medium text-text-primary">{job.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary flex-wrap">
              <span>{job.client}</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
                {job.address}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
                Install {formatDate(job.installDate)}
              </span>
              <button
                onClick={() => downloadJobICS(job)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors duration-fast"
                title="Download .ics for Google / Apple Calendar"
              >
                <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add to calendar
              </button>
              <DrawingsButton jobId={job.id} />
            </div>
          </div>

          <div className="shrink-0 text-right border-l border-border pl-6 self-center">
            <div className="text-sm text-text-secondary tabular-nums">
              Revenue {formatCAD(job.revenue)}
              <span className="text-text-tertiary"> · </span>
              Cost {formatCAD(margin.costsTotal)}
              <span className="text-text-tertiary"> · </span>
              <span className={cn("font-medium", marginToneText)}>
                GM {formatPct(margin.marginPct)}
              </span>
            </div>
            <div className="text-xs text-text-tertiary tabular-nums mt-1">
              {formatCAD(margin.marginAmount)} gross margin
            </div>
          </div>
        </div>

        <MilestonesStrip
          current={job.currentMilestone}
          onChange={(stage) => {
            const gating = phaseGatingBlocker(activeForJob(job.id), stage);
            if (gating) {
              setPendingStage(stage);
              setGatingBlocker(gating);
            } else {
              updateJob(job.id, { currentMilestone: stage });
            }
          }}
        />
        {pendingStage && gatingBlocker && (
          <div className="flex flex-wrap items-center gap-3 min-h-[44px] mt-2">
            <span className="text-sm text-text-primary flex-1 min-w-[200px]">
              ⏳ {stageLabel(pendingStage)} is externally blocked — waiting on{" "}
              {partyLabel(gatingBlocker, contactName)}. Advance anyway?
            </span>
            <button
              onClick={() => {
                setPendingStage(null);
                setGatingBlocker(null);
              }}
              className="inline-flex items-center min-h-[44px] rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                updateJob(job.id, { currentMilestone: pendingStage });
                setPendingStage(null);
                setGatingBlocker(null);
              }}
              className="inline-flex items-center min-h-[44px] rounded-full bg-text-primary text-white px-4 py-1.5 text-sm font-medium hover:bg-status-blocked-soft hover:text-status-blocked transition-colors duration-fast"
            >
              Advance
            </button>
          </div>
        )}
        <ScheduleTimeline job={job} />
        <GanttSchedule
          job={job}
          onUpdate={(dates) => updateJob(job.id, { phaseTargetDates: dates })}
        />
        <BlockersCard jobId={job.id} />
      </header>

      <nav className="border-b border-border bg-surface px-8" aria-label="Job sections">
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
              aria-current={activeTab === tab.key ? "page" : undefined}
              title={!tab.enabled ? "Coming soon" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 px-8 py-6">
        {activeTab === "overview" && <OverviewTab job={job} />}
        {activeTab === "costs" && (
          <CostsTab job={job} onChange={(updated) => updateJob(job.id, () => updated)} />
        )}
        {activeTab === "budget" && <BudgetVsActualTab job={job} />}
        {activeTab === "tasks" && <TasksTab job={job} />}
        {activeTab === "forms" && <JobFormsTab jobId={job.id} />}
        {activeTab === "activity" && <ActivityTab job={job} />}
      </div>
    </div>
  );
}
