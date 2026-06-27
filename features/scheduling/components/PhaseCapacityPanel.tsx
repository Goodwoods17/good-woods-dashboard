"use client";

import { useEffect, useMemo, useState } from "react";
import { useLabour } from "@features/labour/lib/labourStore";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { cn } from "@shared/lib/utils";
import type { MilestoneStage } from "@shared/lib/types";
import {
  buildCapacityModel,
  seedPhaseDurationsFromHistory,
  phaseTargetDatesFromDurations,
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  DEFAULT_PHASE_DURATION_DAYS,
  type CapacitySession,
  type PhaseHours,
  type UtilizationStatus,
} from "@features/scheduling/lib/capacity";
import {
  detectFloatingBottleneck,
  computeCapacityAwareSchedule,
  computeRiskTieredBuffer,
  capacityAwareCommittedDate,
  phaseVarianceNudgeDays,
} from "@features/scheduling/lib/committedDate";

const WINDOW_DAYS = 7;

const STATUS_STYLES: Record<UtilizationStatus, { bar: string; pill: string; label: string }> = {
  under: {
    bar: "bg-status-on-track",
    pill: "bg-status-on-track-soft text-status-on-track",
    label: "Has room",
  },
  near: {
    bar: "bg-status-at-risk",
    pill: "bg-status-at-risk-soft text-status-at-risk",
    label: "Near capacity",
  },
  over: {
    bar: "bg-status-blocked",
    pill: "bg-status-blocked-soft text-status-blocked",
    label: "Over capacity",
  },
};

function fmtHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

/** Load per-phase weekly capacity from the table; fall back to defaults. */
function usePhaseCapacity(): PhaseHours {
  const [capacity, setCapacity] = useState<PhaseHours>(DEFAULT_WEEKLY_CAPACITY_HOURS);
  useEffect(() => {
    if (!hasSupabase()) return;
    let cancelled = false;
    getSupabase()
      .from("scheduling_phase_capacity")
      .select("phase, weekly_capacity_hours")
      .then(({ data, error }) => {
        if (cancelled || error || !data || data.length === 0) return;
        const next: PhaseHours = { ...DEFAULT_WEEKLY_CAPACITY_HOURS };
        for (const row of data as { phase: string; weekly_capacity_hours: number | string }[]) {
          if (row.phase in next) {
            next[row.phase as MilestoneStage] = Number(row.weekly_capacity_hours);
          }
        }
        setCapacity(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return capacity;
}

export function PhaseCapacityPanel() {
  const { sessions } = useLabour();
  const capacity = usePhaseCapacity();

  // Trailing-week window, computed once on mount so the model is stable.
  const [now] = useState(() => Date.now());
  const windowStart = useMemo(
    () => new Date(now - WINDOW_DAYS * 24 * 3_600_000).toISOString(),
    [now]
  );
  const windowEnd = useMemo(() => new Date(now).toISOString(), [now]);

  // The labour store's CapacitySession is a structural subset of LabourSession.
  const history = sessions as unknown as CapacitySession[];

  const model = useMemo(
    () => buildCapacityModel(history, capacity, windowStart, windowEnd),
    [history, capacity, windowStart, windowEnd]
  );

  const durations = useMemo(() => seedPhaseDurationsFromHistory(history), [history]);
  const newJobTargets = useMemo(
    () => phaseTargetDatesFromDurations(new Date(now).toISOString().slice(0, 10), durations),
    [now, durations]
  );

  // S3: capacity-aware committed date recommendation for a hypothetical new job.
  const todayStr = useMemo(() => new Date(now).toISOString().slice(0, 10), [now]);
  const capacitySchedule = useMemo(
    () => computeCapacityAwareSchedule(todayStr, durations, model),
    [todayStr, durations, model]
  );
  const varianceNudge = useMemo(() => phaseVarianceNudgeDays(history), [history]);
  const riskBuffer = useMemo(
    () =>
      computeRiskTieredBuffer({
        totalInternalDays: capacitySchedule.totalWorkDays,
        subDependencyCount: 0,
        varianceNudgeDays: varianceNudge,
      }),
    [capacitySchedule.totalWorkDays, varianceNudge]
  );
  const recommendedCommitDate = useMemo(
    () => capacityAwareCommittedDate(capacitySchedule.internalTargetDate, riskBuffer.totalDays),
    [capacitySchedule.internalTargetDate, riskBuffer.totalDays]
  );

  // S3: floating bottleneck — the most-overloaded phase this week.
  const bottleneck = useMemo(() => detectFloatingBottleneck(model), [model]);

  return (
    <div className="space-y-6" data-testid="phase-capacity-panel">
      {bottleneck && (
        <div
          data-testid="floating-bottleneck"
          data-phase={bottleneck.phase}
          className="flex items-start gap-3 rounded-2xl border border-status-blocked-soft bg-status-blocked-soft/40 p-4"
        >
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-status-blocked" />
          <div className="text-sm">
            <span className="font-medium text-text-primary">
              Floating bottleneck: {bottleneck.label}
            </span>{" "}
            <span className="text-text-secondary">
              is the most-loaded work-center this week (
              {Math.round(bottleneck.ratio * 100)}% of capacity).
            </span>
          </div>
        </div>
      )}

      <section className="rounded-2xl bg-surface p-5 shadow-resting">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Phase capacity this week</h2>
          <p className="text-sm text-text-secondary">
            Each phase doubles as a work-center. Load is the active shop time logged against it over
            the last {WINDOW_DAYS} days, against its weekly capacity.
          </p>
        </header>
        <ul className="space-y-3">
          {model.map((row) => {
            const styles = STATUS_STYLES[row.status];
            const pct = row.capacityHours > 0 ? (row.loadHours / row.capacityHours) * 100 : 100;
            return (
              <li
                key={row.phase}
                data-testid={`capacity-row-${row.phase}`}
                data-status={row.status}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary">{row.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-text-secondary">
                      {fmtHours(row.loadHours)} / {fmtHours(row.capacityHours)}
                    </span>
                    <span
                      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", styles.pill)}
                    >
                      {styles.label}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={cn("h-full rounded-full transition-all duration-fast", styles.bar)}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-surface p-5 shadow-resting">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Default phase durations for a new job
          </h2>
          <p className="text-sm text-text-secondary">
            Derived from real labour history — the average active time the shop has actually spent
            per job, per phase — instead of a hand-typed guess. A job started today lands these
            internal targets.
          </p>
        </header>
        <ul className="divide-y divide-border-faint">
          {model.map((row) => (
            <li
              key={row.phase}
              className="flex items-baseline justify-between gap-3 py-2"
              data-testid={`duration-row-${row.phase}`}
            >
              <span className="text-sm font-medium text-text-primary">{row.label}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-text-secondary">
                  {durations[row.phase]}d
                </span>
                <span className="font-mono text-xs tabular-nums text-text-tertiary">
                  → {newJobTargets[row.phase]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-2xl bg-surface p-5 shadow-resting"
        data-testid="capacity-aware-date-section"
      >
        <header className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Capacity-aware committed date (new job, today)
          </h2>
          <p className="text-sm text-text-secondary">
            Internal target stretched by current load, plus a risk-tiered buffer. Honest contingency
            sized from the schedule, not a flat guess.
          </p>
        </header>
        <dl className="divide-y divide-border-faint text-sm">
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-text-secondary">Internal target</dt>
            <dd className="font-mono tabular-nums text-text-primary">
              {capacitySchedule.internalTargetDate}
              <span className="ml-1 text-xs text-text-tertiary">
                ({capacitySchedule.totalWorkDays}d)
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-text-secondary">
              Risk buffer
              <span className="ml-1 text-xs text-text-tertiary">
                {riskBuffer.baseDays}d base + {riskBuffer.subDays}d subs +{" "}
                {riskBuffer.varianceDays}d variance
              </span>
            </dt>
            <dd className="font-mono tabular-nums text-text-primary">
              +{riskBuffer.totalDays}d
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2">
            <dt className="font-medium text-text-primary">Recommended committed date</dt>
            <dd
              className="font-mono font-medium tabular-nums text-text-primary"
              data-testid="recommended-commit-date"
            >
              {recommendedCommitDate}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
