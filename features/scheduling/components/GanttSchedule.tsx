"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Pin, PinOff, RotateCcw, Check, GitBranch } from "lucide-react";
import { MILESTONE_STAGES, type Job, type MilestoneStage } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { GanttTask } from "frappe-gantt";
import { schedulingEnabled } from "../lib/featureFlag";
import {
  rippleForward,
  pullPlanBackward,
  type PinnedPhases,
  type ConflictWarning,
  type RippleResult,
} from "../lib/gantt";
import { DEFAULT_PHASE_DURATION_DAYS } from "../lib/phases";

// Frappe Gantt is loaded client-side only (requires a DOM).

/** The YYYY-MM-DD start of a phase bar: the previous phase's end date, or a fallback. */
function phaseStart(
  phase: MilestoneStage,
  dates: Partial<Record<MilestoneStage, string>>,
  fallback: string
): string {
  const idx = MILESTONE_STAGES.findIndex((s) => s.key === phase);
  if (idx === 0) return fallback;
  const prev = MILESTONE_STAGES[idx - 1].key;
  return dates[prev] ?? fallback;
}

/** Build the Frappe Gantt task list from phaseTargetDates + pinned set. */
function buildGanttTasks(
  dates: Partial<Record<MilestoneStage, string>>,
  pinned: PinnedPhases,
  fallback: string
): GanttTask[] {
  const tasks: GanttTask[] = [];
  MILESTONE_STAGES.forEach(({ key, label }, idx) => {
    const end = dates[key];
    if (!end) return;
    const start = phaseStart(key, dates, fallback);
    const safeStart = start <= end ? start : end;
    tasks.push({
      id: key,
      name: pinned.has(key) ? `[P] ${label}` : label,
      start: safeStart,
      end,
      progress: 0,
      dependencies: idx > 0 ? MILESTONE_STAGES[idx - 1].key : "",
      custom_class: pinned.has(key) ? "pinned-phase" : "",
    });
  });
  return tasks;
}

/**
 * Editable 6-phase Gantt (Frappe Gantt, MIT) for a single job.
 *
 * S5 feature (issue #93) — ships behind NEXT_PUBLIC_SCHEDULING_ENABLED.
 *
 * - Drag a phase bar: auto-ripple downstream phases by the same work-day delta.
 *   Pinned phases block the ripple and show a conflict warning.
 * - Click Pin on a phase to make it a fixed anchor. Pinning Install triggers
 *   a pull-plan backward that re-derives all preceding dates from the anchor.
 * - A preview panel shows proposed changes + conflicts before the user confirms.
 *   "Apply" saves via `onUpdate`; "Undo" reverts.
 */
export function GanttSchedule({
  job,
  onUpdate,
}: {
  job: Job;
  onUpdate?: (dates: Partial<Record<MilestoneStage, string>>) => Promise<void> | void;
}) {
  if (!schedulingEnabled()) return null;
  return <GanttScheduleInner job={job} onUpdate={onUpdate} />;
}

// Separate inner component so useEffect hooks are never inside a conditional.
function GanttScheduleInner({
  job,
  onUpdate,
}: {
  job: Job;
  onUpdate?: (dates: Partial<Record<MilestoneStage, string>>) => Promise<void> | void;
}) {
  // Committed = saved state; preview = proposed-but-not-yet-applied ripple.
  const [committed, setCommitted] = useState<Partial<Record<MilestoneStage, string>>>(
    () => job.phaseTargetDates ?? {}
  );
  const [preview, setPreview] = useState<Partial<Record<MilestoneStage, string>> | null>(null);
  const [pinned, setPinned] = useState<PinnedPhases>(new Set<MilestoneStage>());
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [saving, setSaving] = useState(false);

  // Sync from prop when the parent reloads the job.
  useEffect(() => {
    setCommitted(job.phaseTargetDates ?? {});
    setPreview(null);
    setConflicts([]);
  }, [job.id, job.phaseTargetDates]);

  const activeDates = preview ?? committed;

  // Derive a sensible fallback start for phase bars (5 work days before earliest target).
  const jobStartFallback = (() => {
    const all = (Object.values(activeDates).filter(Boolean) as string[]).sort();
    if (all.length === 0) return new Date().toISOString().slice(0, 10);
    const d = new Date(`${all[0]}T00:00:00.000Z`);
    let added = 0;
    while (added < 5) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added += 1;
    }
    return d.toISOString().slice(0, 10);
  })();

  // ── Frappe Gantt DOM integration ──────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  // We store the Gantt instance as unknown to avoid importing the class type at
  // module level (it's loaded dynamically). We only call .refresh() on it.
  const ganttRef = useRef<{ refresh: (tasks: GanttTask[]) => void } | null>(null);

  const handleDateChange = useCallback(
    (taskId: string, _start: Date, end: Date) => {
      const phase = taskId as MilestoneStage;
      if (pinned.has(phase)) return; // pinned bars shouldn't be draggable, but guard anyway
      const newDate = end.toISOString().slice(0, 10);
      const base = preview ?? committed;
      const result: RippleResult = rippleForward(base, phase, newDate, pinned);
      setPreview(result.dates);
      setConflicts(result.conflicts);
    },
    [committed, preview, pinned]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const tasks = buildGanttTasks(activeDates, pinned, jobStartFallback);
    if (tasks.length === 0) return;

    let cancelled = false;

    import("frappe-gantt").then((mod) => {
      if (cancelled || !containerRef.current) return;

      // Inject the CSS once into the document head.
      const cssId = "frappe-gantt-css";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.css";
        document.head.appendChild(link);
      }

      const GanttClass = mod.default;

      if (ganttRef.current) {
        ganttRef.current.refresh(tasks);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ganttRef.current = new (GanttClass as any)(containerRef.current!, tasks, {
          view_mode: "Week",
          readonly_progress: true,
          // We handle ripple ourselves — disable the built-in dependency movement.
          move_dependencies: false,
          today_button: false,
          lines: "both",
          popup: false,
          on_date_change(task: GanttTask, start: Date, end: Date) {
            handleDateChange(task.id, start, end);
          },
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeDates, pinned, handleDateChange, jobStartFallback]);

  useEffect(() => {
    return () => {
      ganttRef.current = null;
    };
  }, []);

  // ── Pin / pull-plan ───────────────────────────────────────────────────────

  const togglePin = useCallback(
    (phase: MilestoneStage) => {
      setPinned((prev) => {
        const next = new Set(prev);
        if (next.has(phase)) {
          next.delete(phase);
          setConflicts([]);
          return next;
        }
        next.add(phase);

        // Pinning Install triggers pull-plan backward.
        if (phase === "install") {
          const base = preview ?? committed;
          const installDate = base["install"] ?? job.installDate;
          const result = pullPlanBackward(
            "install",
            installDate,
            DEFAULT_PHASE_DURATION_DAYS,
            base,
            next
          );
          setPreview(result.dates);
          setConflicts(result.conflicts);
        }
        return next;
      });
    },
    [committed, preview, job.installDate]
  );

  // ── Apply / Undo ──────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await onUpdate?.(preview);
      setCommitted(preview);
      setPreview(null);
      setConflicts([]);
    } finally {
      setSaving(false);
    }
  }, [preview, onUpdate]);

  const handleUndo = useCallback(() => {
    setPreview(null);
    setConflicts([]);
  }, []);

  const hasPending = preview !== null;
  const hasConflicts = conflicts.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section
      data-testid="gantt-schedule"
      aria-label="Editable Gantt schedule"
      className="mt-4 rounded-xl border border-border bg-surface overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          <GitBranch className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
          Schedule — Gantt
        </div>
        {hasPending && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border hover:bg-surface-muted transition-colors duration-fast"
              aria-label="Undo ripple changes"
              data-testid="gantt-undo"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
              Undo
            </button>
            <button
              onClick={handleApply}
              disabled={saving || hasConflicts}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors duration-fast font-medium",
                hasConflicts
                  ? "border-status-blocked text-status-blocked bg-status-blocked-soft cursor-not-allowed opacity-70"
                  : "border-accent text-accent hover:bg-accent/10"
              )}
              aria-label="Apply ripple changes"
              data-testid="gantt-apply"
            >
              <Check className="h-3 w-3" strokeWidth={2} />
              {saving ? "Saving..." : "Apply"}
            </button>
          </div>
        )}
      </div>

      {/* Conflict warnings */}
      {hasConflicts && (
        <div
          data-testid="gantt-conflicts"
          className="px-4 py-2 bg-status-blocked-soft border-b border-status-blocked/20"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="h-4 w-4 text-status-blocked mt-0.5 shrink-0"
              strokeWidth={1.75}
            />
            <div className="space-y-0.5">
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-status-blocked">
                  {c.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Phase pin controls */}
      <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5" aria-label="Phase pin controls">
        {MILESTONE_STAGES.map(({ key, label }) => {
          const isPinned = pinned.has(key);
          // Install is the frozen client-committed anchor (jobs.install_date),
          // kept separate from the internal phase_target_dates (ADR 0020). It can
          // be pinned off that committed date even when no internal install target
          // exists — mirroring togglePin's `base["install"] ?? job.installDate`.
          const hasDate = !!activeDates[key] || (key === "install" && !!job.installDate);
          return (
            <button
              key={key}
              onClick={() => hasDate && togglePin(key)}
              disabled={!hasDate}
              data-testid={`gantt-pin-${key}`}
              data-pinned={isPinned ? "true" : "false"}
              title={isPinned ? `Unpin ${label}` : `Pin ${label} as anchor`}
              aria-pressed={isPinned}
              className={cn(
                "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors duration-fast",
                !hasDate && "opacity-40 cursor-not-allowed",
                isPinned
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-accent/50 hover:text-text-primary"
              )}
            >
              {isPinned ? (
                <Pin className="h-3 w-3" strokeWidth={1.75} />
              ) : (
                <PinOff className="h-3 w-3" strokeWidth={1.75} />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {/* Frappe Gantt chart */}
      <div
        className="px-2 pb-4 pt-2 overflow-x-auto"
        ref={containerRef}
        data-testid="gantt-container"
        style={{ minHeight: "220px" }}
      />

      {/* Proposed-change preview table */}
      {hasPending && (
        <div data-testid="gantt-preview-table" className="px-4 pb-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-text-secondary mb-2">
            Proposed changes
            {hasConflicts && (
              <span className="ml-2 text-status-blocked">
                (resolve conflicts above before applying)
              </span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs tabular-nums">
            <span className="text-text-tertiary font-medium">Phase</span>
            <span className="text-text-tertiary font-medium">Current</span>
            <span className="text-text-tertiary font-medium">Proposed</span>
            {MILESTONE_STAGES.map(({ key, label }) => {
              const cur = committed[key];
              const prop = preview?.[key];
              if (!prop && !cur) return null;
              const changed = !!prop && cur !== prop;
              return (
                <div key={key} className="contents">
                  <span
                    className={cn(
                      "text-text-secondary",
                      changed && "font-medium text-text-primary"
                    )}
                  >
                    {label}
                    {pinned.has(key) && (
                      <Pin className="inline ml-1 h-2.5 w-2.5 text-accent" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className={cn(changed && "line-through text-text-tertiary")}>
                    {cur ? formatDate(cur) : "—"}
                  </span>
                  <span className={cn("text-text-primary", changed && "text-accent font-medium")}>
                    {prop ? formatDate(prop) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {Object.keys(activeDates).length === 0 && (
        <div className="px-4 pb-6 pt-4 text-center text-sm text-text-secondary">
          No internal target dates set yet.
          <br />
          <span className="text-xs text-text-tertiary">
            Dates are set when a job is created or via the capacity panel.
          </span>
        </div>
      )}
    </section>
  );
}
