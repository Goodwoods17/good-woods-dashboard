"use client";

/**
 * S17 — Priority/VIP flag + manual bump-with-impact (issue #105).
 *
 * Two sections in one panel (both gated on NEXT_PUBLIC_SCHEDULING_ENABLED):
 *
 *   1. PRIORITY TOGGLE — a star-button the owner clicks to mark / unmark the
 *      current job as Priority/VIP. Priority jobs surface first in capacity
 *      conflicts on the fever board. Persists via onTogglePriority → updateJob.
 *
 *   2. BUMP PANEL (only shown when the current job IS priority) — the owner
 *      selects another job to push and enters how many days to bump it. The
 *      system immediately shows the impact preview:
 *        "pushing Henderson 4d protects Saywell → Henderson committed date
 *         moves to Mar 18, needs re-commit + client message"
 *      Confirming fires onBump → the parent updates the bumped job's committed
 *      date and logs the bump to public.priority_bumps for audit (S14 re-commit
 *      + approval is the next step for the bumped job's owner).
 *
 * Decision spec (issue #105): "You choose, system shows the cost. NOT auto-protect."
 * Every bump is a deliberate, reasoned decision with a mandatory reason field.
 */

import { useState, useMemo } from "react";
import { Star, AlertTriangle, ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatDate } from "@shared/lib/format";
import { useAuth } from "@shared/lib/authStore";
import type { Job } from "@shared/lib/types";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { computeBumpImpact, buildPriorityBumpRecord } from "../lib/priorityBump";
import type { BumpPreview } from "../lib/priorityBump";
import { insertPriorityBump } from "../lib/priorityBumpStore";

// ── Types ─────────────────────────────────────────────────────────────────────

type BumpParams = {
  bumpedJobId: string;
  bumpDays: number;
  reason: string;
  newCommittedDate: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PriorityBumpPanel({
  job,
  onTogglePriority,
  onBump,
}: {
  job: Job;
  onTogglePriority?: () => Promise<void> | void;
  onBump?: (params: BumpParams) => Promise<void> | void;
}) {
  const { jobs } = useJobs();
  const { user } = useAuth();

  const [toggling, setToggling] = useState(false);
  const [selectedBumpJobId, setSelectedBumpJobId] = useState<string>("");
  const [bumpDays, setBumpDays] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [bumping, setBumping] = useState(false);
  const [bumpDone, setBumpDone] = useState(false);

  const isPriority = job.isPriority ?? false;

  // Other active jobs (excluding this one) that have a committed date — the
  // candidate pool for bumping. Complete jobs are excluded; they already shipped.
  const bumpCandidates = useMemo(
    () => jobs.filter((j) => j.id !== job.id && j.pipelineStatus !== "complete" && j.installDate),
    [jobs, job.id]
  );

  const selectedBumpJob = bumpCandidates.find((j) => j.id === selectedBumpJobId) ?? null;

  const preview: BumpPreview | null = useMemo(() => {
    if (!selectedBumpJob || bumpDays < 1) return null;
    return computeBumpImpact({
      priorityJob: { id: job.id, name: job.name },
      bumpedJob: {
        id: selectedBumpJob.id,
        name: selectedBumpJob.name,
        installDate: selectedBumpJob.installDate,
      },
      bumpDays,
    });
  }, [job.id, job.name, selectedBumpJob, bumpDays]);

  const canConfirm = preview !== null && reason.trim().length > 0 && !bumping;

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      await onTogglePriority?.();
    } finally {
      setToggling(false);
    }
  }

  async function handleBump() {
    if (!canConfirm || !preview || !selectedBumpJob) return;
    setBumping(true);
    try {
      // Build the audit record and persist it if Supabase is available.
      const record = buildPriorityBumpRecord({
        priorityJobId: job.id,
        bumpedJobId: selectedBumpJob.id,
        bumpDays: preview.bumpDays,
        reason: reason.trim(),
        oldCommittedDate: selectedBumpJob.installDate,
        newCommittedDate: preview.newCommittedDate,
        bumpedBy: user?.email ?? null,
      });

      await insertPriorityBump(record);

      await onBump?.({
        bumpedJobId: selectedBumpJob.id,
        bumpDays: preview.bumpDays,
        reason: reason.trim(),
        newCommittedDate: preview.newCommittedDate,
      });

      setBumpDone(true);
      setSelectedBumpJobId("");
      setReason("");
      setBumpDays(1);
      // Clear "done" state after a brief moment so the user sees feedback.
      setTimeout(() => setBumpDone(false), 3_000);
    } finally {
      setBumping(false);
    }
  }

  return (
    <section data-testid="priority-bump-panel" className="bg-surface rounded-xl shadow-resting p-6">
      <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-4">
        Priority &amp; conflict resolution
      </h3>

      {/* ── Priority toggle ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-medium text-text-primary">Priority / VIP</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Priority jobs surface first in capacity conflicts and win ties on the fever board.
          </p>
        </div>
        <button
          type="button"
          data-testid="priority-toggle"
          aria-pressed={isPriority}
          aria-label={isPriority ? "Remove Priority flag" : "Set as Priority / VIP"}
          disabled={toggling}
          onClick={handleToggle}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium",
            "border transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            isPriority
              ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
              : "bg-surface-muted text-text-secondary border-border hover:border-border-strong hover:text-text-primary"
          )}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Star
              className={cn(
                "h-3.5 w-3.5",
                isPriority ? "fill-amber-500 stroke-amber-600" : "stroke-current"
              )}
              strokeWidth={isPriority ? 1.5 : 2}
            />
          )}
          {isPriority ? "Priority" : "Set Priority"}
        </button>
      </div>

      {/* Priority badge (visible when priority) */}
      {isPriority && (
        <div
          data-testid="priority-flag-badge"
          data-priority="true"
          className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5"
        >
          <Star className="h-3 w-3 fill-amber-500 stroke-amber-600" strokeWidth={1.5} />
          <span className="font-medium">This job is marked Priority / VIP.</span>
          <span className="text-amber-600">
            It floats first in capacity conflicts and EDD advice.
          </span>
        </div>
      )}

      {/* ── Bump panel (only when this job is priority) ─────────────────────── */}
      {isPriority && (
        <div data-testid="bump-section" className="border-t border-border-faint pt-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">
              Manual bump — push a job to protect this one
            </p>
            <p className="text-xs text-text-secondary">
              Select a conflicting job and the number of days to push its committed date. The system
              shows the exact impact before you confirm — you decide, system shows the cost. The
              bumped job routes through the re-commit + approval flow automatically.
            </p>
          </div>

          {/* Job select */}
          <div>
            <label
              htmlFor="bump-job-select"
              className="block text-xs text-text-tertiary mb-1 uppercase tracking-[0.06em]"
            >
              Job to push
            </label>
            {bumpCandidates.length === 0 ? (
              <p className="text-sm text-text-secondary italic">
                No other active jobs in the schedule.
              </p>
            ) : (
              <select
                id="bump-job-select"
                data-testid="bump-job-select"
                value={selectedBumpJobId}
                onChange={(e) => {
                  setSelectedBumpJobId(e.target.value);
                  setBumpDone(false);
                }}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Select a job…</option>
                {bumpCandidates.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} (install {formatDate(j.installDate)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Days input */}
          {selectedBumpJobId && (
            <div>
              <label
                htmlFor="bump-days-input"
                className="block text-xs text-text-tertiary mb-1 uppercase tracking-[0.06em]"
              >
                Work days to push
              </label>
              <input
                id="bump-days-input"
                type="number"
                data-testid="bump-days-input"
                min={1}
                max={90}
                value={bumpDays}
                onChange={(e) => {
                  setBumpDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)));
                  setBumpDone(false);
                }}
                className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          {/* Impact preview */}
          {preview && (
            <div
              data-testid="bump-impact-preview"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-sm text-amber-800 font-medium">Impact preview</p>
              </div>
              <p className="text-sm text-amber-900 leading-relaxed">{preview.message}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-800 mt-2">
                <div>
                  <dt className="text-amber-600 uppercase tracking-wide">Old date</dt>
                  <dd className="font-medium">{formatDate(preview.oldCommittedDate)}</dd>
                </div>
                <div>
                  <dt className="text-amber-600 uppercase tracking-wide">New date</dt>
                  <dd className="font-medium">{formatDate(preview.newCommittedDate)}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Reason */}
          {preview && (
            <div>
              <label
                htmlFor="bump-reason"
                className="block text-xs text-text-tertiary mb-1 uppercase tracking-[0.06em]"
              >
                Reason (required)
              </label>
              <input
                id="bump-reason"
                type="text"
                data-testid="bump-reason-input"
                placeholder="e.g. Kitchen must ship before Christmas — Saywell is higher priority"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          {/* Confirm button */}
          {preview && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="bump-confirm"
                disabled={!canConfirm}
                onClick={handleBump}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium",
                  "transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  canConfirm
                    ? "bg-accent text-white hover:bg-accent/90"
                    : "bg-surface-muted text-text-disabled cursor-not-allowed"
                )}
              >
                {bumping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                ) : bumpDone ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {bumpDone ? "Bump logged" : "Confirm bump"}
              </button>
              {!reason.trim() && preview && (
                <p className="text-xs text-text-tertiary">Add a reason to confirm.</p>
              )}
            </div>
          )}

          {/* Success confirmation */}
          {bumpDone && (
            <div
              data-testid="bump-success"
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span>
                Bump logged. <strong>{preview?.bumpedJobName ?? "The bumped job"}</strong> needs a
                re-commit + client message — open its Schedule tab to proceed.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
