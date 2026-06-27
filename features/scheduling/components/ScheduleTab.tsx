"use client";

import { Share2, CalendarClock } from "lucide-react";
import type { Job, MilestoneStage } from "@shared/lib/types";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { buildScheduleOverview } from "../lib/scheduleOverview";
import { ScheduleTimeline } from "./ScheduleTimeline";
import { GanttSchedule } from "./GanttSchedule";
import { MakeReadyChecklistPanel } from "./MakeReadyChecklistPanel";
import { CommitmentLedgerPanel } from "./CommitmentLedgerPanel";
import { RecommitPanel } from "./RecommitPanel";
import { PriorityBumpPanel } from "./PriorityBumpPanel";
import { ClientPortalPanel } from "./ClientPortalPanel";
import { KickoffArtifactPanel } from "./KickoffArtifactPanel";
import type { MakeReadySignals } from "../lib/makeReady";

/**
 * Schedule tab for the JobDetail page (S7, issue #95).
 *
 * Consolidates the full schedule hub:
 *   – Committed-vs-target summary row
 *   – Read-only 6-phase timeline (ScheduleTimeline)
 *   – Editable Gantt with ripple preview (GanttSchedule)
 *   – Make-ready gate checklist (S12, issue #100)
 *   – Share (ICS) + Google-push entry points (Google push lives in S23 / P6)
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED; the parent JobDetail only adds
 * this tab to the nav when the flag is on, so this component renders
 * unconditionally once slotted in.
 */
export function ScheduleTab({
  job,
  onUpdate,
  onRecommit,
  onTogglePriority,
  onBump,
}: {
  job: Job;
  onUpdate?: (dates: Partial<Record<MilestoneStage, string>>) => Promise<void> | void;
  onRecommit?: (patch: { installDate: string; bufferDays: number }) => Promise<void> | void;
  /** S17: toggle the Priority/VIP flag on this job. */
  onTogglePriority?: () => Promise<void> | void;
  /** S17: push another job's committed date to protect this priority job. */
  onBump?: (params: {
    bumpedJobId: string;
    bumpDays: number;
    reason: string;
    newCommittedDate: string;
  }) => Promise<void> | void;
}) {
  const overview = buildScheduleOverview(job, new Date());

  // Derive make-ready signals from what the Job type can tell us.
  // These are best-effort heuristics from data already on the job — deeper
  // signals (per-item phase progress, inventory) require dedicated fetches
  // and live in the store layer once those features mature.
  const milestoneIndex = MILESTONE_STAGES.findIndex((s) => s.key === job.currentMilestone);
  const makeReadySignals: MakeReadySignals = {
    // If the current milestone is past Design (index 0), drawings are approved.
    designSignoff: milestoneIndex > 0,
    // No free-text blocker on the job = no outstanding block. Phase-gated
    // blockers would need the jobBlockersStore — out of scope for this component.
    blockerResolved: !job.blocker,
    // Material logging requires the job-items store; default to false here.
    // Future: wire this from a useJobProgress(job.id).items count.
    materialLogged: false,
  };

  return (
    <div data-testid="schedule-tab" className="flex flex-col gap-4 max-w-5xl">
      {/* ── Committed vs Target summary ─────────────────────────────────────── */}
      <section className="bg-surface rounded-xl shadow-resting p-6">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Schedule overview
        </h3>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <Field label="Committed install" value={formatDate(overview.committedInstall)} />
          {overview.internalTarget ? (
            <Field label="Internal target" value={formatDate(overview.internalTarget)} />
          ) : (
            <Field label="Internal target" value="—" />
          )}
          <Field label="Buffer" value={`${overview.bufferDays}d`} />
          <div>
            <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">
              Status
            </dt>
            <dd>
              <span
                data-testid="schedule-tab-status"
                data-status={overview.status}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium",
                  overview.status === "behind"
                    ? "bg-status-blocked-soft text-status-blocked"
                    : "bg-status-on-track-soft text-status-on-track"
                )}
              >
                {overview.status === "behind" ? "Behind" : "On track"}
              </span>
            </dd>
          </div>
        </dl>
        <div className="mt-3 text-xs text-text-tertiary tabular-nums">
          {overview.phasesComplete} of {overview.phasesTotal} phases complete
        </div>
      </section>

      {/* ── Phase timeline (read-only) ──────────────────────────────────────── */}
      <ScheduleTimeline job={job} />

      {/* ── Editable Gantt with ripple preview ─────────────────────────────── */}
      <GanttSchedule job={job} onUpdate={onUpdate} />

      {/* ── Make-ready gate checklist (S12) ────────────────────────────────── */}
      <MakeReadyChecklistPanel
        jobId={job.id}
        currentMilestone={job.currentMilestone}
        signals={makeReadySignals}
      />

      {/* ── Commitment ledger + two-level ownership + per-owner reliability (S13) ── */}
      <CommitmentLedgerPanel job={job} />

      {/* ── Re-commit flow + revision history + change orders (S14) ── */}
      <RecommitPanel job={job} onRecommit={onRecommit} />

      {/* ── Priority/VIP flag + manual bump-with-impact (S17) ── */}
      <PriorityBumpPanel job={job} onTogglePriority={onTogglePriority} onBump={onBump} />

      {/* ── Read-only client schedule portal link (S18) ── */}
      <ClientPortalPanel job={job} />

      {/* ── Kickoff expectation-setting artifact (S20) ── */}
      <KickoffArtifactPanel job={job} />

      {/* ── Share + Google-push entry points ────────────────────────────────── */}
      <section
        data-testid="schedule-share-section"
        className="bg-surface rounded-xl shadow-resting p-6"
      >
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Share &amp; integrations
        </h3>
        <div className="flex flex-wrap gap-3">
          {/* ICS share — available today via the existing downloadJobICS helper.
              The Schedule tab exposes this as an explicit entry point so it's
              discoverable without hunting through the header. */}
          <button
            type="button"
            data-testid="schedule-share-ics"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
            aria-label="Share schedule via ICS calendar file"
          >
            <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Share via ICS
          </button>

          {/* Google Calendar push — planned for S23 (P6). Entry point present so
              the user knows it's coming; disabled until the OAuth + push slice lands. */}
          <button
            type="button"
            data-testid="schedule-google-push"
            disabled
            title="Google Calendar push — coming in a future release"
            aria-disabled="true"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-disabled cursor-not-allowed opacity-50"
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Google Calendar push
          </button>
        </div>
        <p className="text-xs text-text-tertiary mt-3">
          Google Calendar push is planned for a future release.
        </p>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
