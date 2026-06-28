"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { MILESTONE_STAGES, type Job, type MilestoneStage } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { schedulingEnabled } from "../lib/featureFlag";
import {
  scheduleStatus,
  committedDate,
  bufferDaysFor,
  SCHEDULE_STATUS_LABELS,
} from "../lib/schedule";
import { DEFAULT_PHASE_DURATION_DAYS } from "../lib/phases";
import { computeRiskTieredBuffer } from "../lib/committedDate";
import {
  computeBufferBurn,
  chainCompletionPct,
  feverZone,
  computeRecoveryFlag,
} from "../lib/bufferBurn";
import { FeverChart } from "./FeverChart";

/**
 * Read-only 6-phase schedule timeline for a job. S1 added the basic on-track /
 * behind badge; S3 adds a risk-buffer breakdown. Editing, capacity-aware
 * computation and buffer-burn land in later slices. Renders nothing unless
 * SCHEDULING_ENABLED is on.
 */
export function ScheduleTimeline({ job }: { job: Job }) {
  if (!schedulingEnabled()) return null;

  const today = new Date();
  const currentIdx = MILESTONE_STAGES.findIndex((s) => s.key === job.currentMilestone);
  const targets = job.phaseTargetDates ?? null;
  const status = scheduleStatus(job.currentMilestone, targets, today);
  const buffer = bufferDaysFor(job);
  const committed = committedDate(job);

  // S3: risk-tiered buffer breakdown. Use the job's stored buffer_days as the
  // override if set; otherwise compute from the default phase durations (a new
  // job's total = sum of DEFAULT_PHASE_DURATION_DAYS = 19 work days).
  const defaultTotalDays = Object.values(DEFAULT_PHASE_DURATION_DAYS).reduce((s, d) => s + d, 0);
  const riskBuffer = computeRiskTieredBuffer({
    totalInternalDays: defaultTotalDays,
    subDependencyCount: 0,
    overrideBufferDays: job.bufferDays ?? null,
  });

  // S6: buffer burn + fever chart + recovery flag.
  // Only meaningful when the job has both an internal target and a committed date.
  const hasScheduleData = !!job.internalTargetDate && !!job.installDate;
  const burn = hasScheduleData
    ? computeBufferBurn(job.internalTargetDate!, job.installDate, today)
    : null;
  const chainPct = chainCompletionPct({
    currentMilestoneIndex: currentIdx >= 0 ? currentIdx : 0,
    totalPhases: MILESTONE_STAGES.length,
  });
  const zone = burn ? feverZone(burn.bufferConsumedPct, chainPct) : null;
  const recoveryFlag = zone ? computeRecoveryFlag(zone) : null;

  const targetFor = (key: MilestoneStage) => targets?.[key] ?? null;

  return (
    <section
      data-testid="schedule-timeline"
      aria-label="Schedule timeline"
      className="mt-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          <CalendarClock className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} />
          Schedule
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary tabular-nums">
          <span>
            Committed install{" "}
            <span className="font-medium text-text-primary">{formatDate(committed)}</span>
          </span>
          <span>
            Buffer <span className="font-medium text-text-primary">{buffer}d</span>
          </span>
          <span
            data-testid="schedule-status-badge"
            data-status={status}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-label font-medium",
              status === "behind"
                ? "bg-status-blocked-soft text-status-blocked"
                : "bg-status-on-track-soft text-status-on-track"
            )}
          >
            {SCHEDULE_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      <ol className="flex items-stretch gap-0">
        {MILESTONE_STAGES.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isLast = idx === MILESTONE_STAGES.length - 1;
          const target = targetFor(stage.key);

          return (
            <li key={stage.key} className="flex items-start flex-1 last:flex-none">
              <div className="flex flex-col gap-1.5 shrink-0">
                <div
                  className={cn(
                    "h-6 w-6 rounded-full grid place-items-center text-xs font-medium border",
                    isPast && "bg-status-on-track border-status-on-track text-white",
                    isCurrent && "bg-white text-text-primary ring-2 ring-accent border-transparent",
                    !isPast && !isCurrent && "bg-surface border-border text-text-tertiary"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {idx + 1}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isCurrent ? "text-text-primary" : "text-text-secondary"
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-xs tabular-nums text-text-tertiary whitespace-nowrap">
                  {target ? formatDate(target) : "—"}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "h-px flex-1 mx-3 mt-3 transition-colors duration-base",
                    isPast ? "bg-status-on-track" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* S3: risk-tiered buffer breakdown */}
      <div
        data-testid="risk-buffer-breakdown"
        className="mt-4 border-t border-border pt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-text-secondary tabular-nums"
      >
        <span className="text-text-tertiary font-medium">Buffer breakdown</span>
        <span>{riskBuffer.baseDays}d base</span>
        <span>+{riskBuffer.subDays}d subs</span>
        <span>+{riskBuffer.varianceDays}d variance</span>
        {riskBuffer.isOverridden && (
          <span className="text-text-tertiary">(overridden → {riskBuffer.totalDays}d)</span>
        )}
      </div>

      {/* S6: fever chart + buffer burn + recovery flag */}
      {burn && zone && recoveryFlag && (
        <div data-testid="fever-section" className="mt-4 border-t border-border pt-4 space-y-3">
          {/* Recovery flag — owner-only, visible only in RED zone */}
          {recoveryFlag.active && (
            <div
              data-testid="recovery-flag"
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-status-blocked-soft bg-status-blocked-soft/50 px-3 py-2 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-status-blocked"
                strokeWidth={1.75}
              />
              <span className="font-medium text-status-blocked">{recoveryFlag.message}</span>
            </div>
          )}

          {/* Buffer consumption summary */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-text-secondary tabular-nums">
            <span className="font-medium text-text-primary">Buffer burn</span>
            <span>
              <span className="font-medium text-text-primary">{burn.consumedBufferDays}d</span>{" "}
              consumed of {burn.totalBufferDays}d
            </span>
            <span
              className={cn(
                "font-medium",
                zone === "green" && "text-emerald-600",
                zone === "yellow" && "text-amber-600",
                zone === "red" && "text-status-blocked"
              )}
            >
              {Math.round(burn.bufferConsumedPct)}% of buffer
            </span>
            <span className="text-text-tertiary">{Math.round(chainPct)}% chain complete</span>
          </div>

          {/* Fever chart — buffer% vs chain% */}
          <FeverChart
            chainCompletionPct={chainPct}
            bufferConsumedPct={burn.bufferConsumedPct}
            zone={zone}
            className="max-w-xs"
          />
        </div>
      )}
    </section>
  );
}
