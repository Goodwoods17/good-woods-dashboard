"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { MILESTONE_STAGES } from "@shared/lib/types";
import type { Job } from "@shared/lib/types";
import { useJobProgress } from "../lib/jobProgressStore";
import { useStatusBoard, isActiveJob } from "../lib/boardStore";
import { phaseProgress, jobProgress } from "../lib/progress";
import { JobStatusTab } from "./JobStatusTab";
import { ItemTimeline } from "./ItemTimeline";
import type { TrackableItem } from "../lib/types";

// ─── Mini phase progress bar (board card) ─────────────────────────────────────

function MiniBar({ pct }: { pct: number }) {
  const pctInt = Math.round(pct * 100);
  return (
    <div className="flex-1 h-1 rounded-full bg-surface-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-accent transition-all duration-slow"
        style={{ width: `${pctInt}%` }}
        role="progressbar"
        aria-valuenow={pctInt}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

// ─── Job card (board list item) ───────────────────────────────────────────────

function JobCard({
  job,
  items,
  onClick,
}: {
  job: Job;
  items: TrackableItem[];
  onClick: () => void;
}) {
  const totalPct = Math.round(jobProgress(items) * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="board-job-card"
      data-job-id={job.id}
      aria-label={`View progress for ${job.name}`}
      className="w-full text-left rounded-xl border border-border bg-surface shadow-resting p-4 transition-shadow duration-fast hover:shadow-elevated"
    >
      {/* Header: code + name + overall % */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">
            {job.code}
          </p>
          <p className="text-sm font-medium text-text-primary truncate mt-0.5">{job.name}</p>
        </div>
        <span
          className="text-sm font-semibold text-accent tabular-nums shrink-0"
          data-testid={`board-job-pct-${job.id}`}
        >
          {totalPct}%
        </span>
      </div>

      {/* Per-phase mini bars */}
      <div className="space-y-1.5">
        {MILESTONE_STAGES.map(({ key, label }) => {
          const pct = phaseProgress(items, key);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-text-tertiary w-16 shrink-0 truncate">{label}</span>
              <MiniBar pct={pct} />
              <span className="text-[10px] text-text-tertiary tabular-nums w-6 text-right">
                {Math.round(pct * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ─── Drill-in view ────────────────────────────────────────────────────────────

/**
 * Full field-crew view for a single job: progress + items + timeline.
 * Calls useJobProgress internally so JobStatusTab and ItemTimeline share the
 * same subscription (the per-instance channel key in jobProgressStore prevents
 * duplicate-subscriber errors from the board's own channel on the same job).
 */
function JobDrillIn({ job, onBack }: { job: Job; onBack: () => void }) {
  // Load items once at this level so both JobStatusTab and ItemTimeline
  // get the same data without a redundant query.
  const { items, pieces } = useJobProgress(job.id);

  const pickerItems = useMemo(
    () => [
      ...items.map((i) => ({ id: i.id, label: i.label })),
      ...pieces.map((p) => ({ id: p.id, label: p.label })),
    ],
    [items, pieces]
  );

  return (
    <div data-testid="board-drill-in">
      {/* Back navigation */}
      <div className="px-4 pt-5 pb-1">
        <button
          type="button"
          onClick={onBack}
          data-testid="board-back-btn"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All jobs
        </button>
      </div>

      <PageHeader eyebrow={job.code} title={job.name} subtitle="Live job status" />

      <JobStatusTab jobId={job.id} />
      <ItemTimeline jobId={job.id} items={pickerItems} />
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

/**
 * Owner live board: all active jobs with per-phase mini progress bars. Tapping
 * a card drills into the full field view (JobStatusTab + ItemTimeline) for that
 * job. Multi-job realtime: any job_item or job_piece change anywhere pushes
 * through the shared useStatusBoard channel and refreshes the relevant card.
 */
export function StatusBoard() {
  const { jobs, loading: jobsLoading } = useJobs();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const activeJobs = useMemo(() => jobs.filter(isActiveJob), [jobs]);
  const activeJobIds = useMemo(() => activeJobs.map((j) => j.id), [activeJobs]);

  const { byJobId, loading: boardLoading } = useStatusBoard(activeJobIds);

  const selectedJob = useMemo(
    () => (selectedJobId ? (jobs.find((j) => j.id === selectedJobId) ?? null) : null),
    [selectedJobId, jobs]
  );

  // Drill-in: show the full field view for the selected job.
  if (selectedJob) {
    return <JobDrillIn job={selectedJob} onBack={() => setSelectedJobId(null)} />;
  }

  const loading = jobsLoading || boardLoading;

  return (
    <div>
      <PageHeader
        eyebrow="Live board"
        title="Job progress"
        subtitle={
          loading
            ? "Loading…"
            : `${activeJobs.length} active job${activeJobs.length !== 1 ? "s" : ""}`
        }
      />

      {loading ? (
        <div className="px-4 py-6">
          <p className="text-sm text-text-tertiary">Loading jobs…</p>
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="px-4 py-6">
          <p className="text-sm text-text-tertiary">No active jobs right now.</p>
        </div>
      ) : (
        <div
          data-testid="status-board"
          className="px-4 pb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {activeJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              items={byJobId.get(job.id) ?? []}
              onClick={() => setSelectedJobId(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
