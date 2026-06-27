"use client";

import { useMemo, useState } from "react";
import { useLabour } from "@features/labour/lib/labourStore";
import {
  buildWeeklyWindows,
  findEarliestBookableStart,
  DEFAULT_LOOKAHEAD_WEEKS,
  type CapacityWindow,
} from "@features/scheduling/lib/freeCapacity";
import { MILESTONE_STAGES } from "@shared/lib/types";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  type CapacitySession,
  type PhaseHours,
} from "@features/scheduling/lib/capacity";
import { cn } from "@shared/lib/utils";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import type { MilestoneStage } from "@shared/lib/types";
import { useEffect } from "react";

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

type FreeRowProps = { window: CapacityWindow };

function WindowRow({ window }: FreeRowProps) {
  const phases = MILESTONE_STAGES.map((s) => s.key as MilestoneStage);
  const totalFree = phases.reduce((sum, p) => sum + window.freeHoursByPhase[p], 0);

  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        window.isBookable
          ? "border-status-on-track-soft bg-status-on-track-soft/30"
          : "border-border-faint bg-surface-muted/40"
      )}
      data-testid={`free-window-${window.weekStart}`}
      data-bookable={window.isBookable}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{window.label}</span>
        {window.isBookable ? (
          <span className="rounded-full bg-status-on-track-soft px-2 py-0.5 text-xs font-medium text-status-on-track">
            Bookable
          </span>
        ) : (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-tertiary">
            Constrained
          </span>
        )}
      </div>
      <ul className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6">
        {MILESTONE_STAGES.map(({ key, label }) => {
          const free = window.freeHoursByPhase[key];
          return (
            <li
              key={key}
              className="flex flex-col"
              data-testid={`free-hours-row-${key}`}
              aria-label={`${label}: ${fmtHours(free)} free`}
            >
              <span className="text-xs text-text-tertiary">{label.split(/[\s/]/)[0]}</span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums font-medium",
                  free === 0
                    ? "text-status-blocked"
                    : free < 16
                    ? "text-status-at-risk"
                    : "text-status-on-track"
                )}
              >
                {fmtHours(free)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-text-tertiary">
        {fmtHours(totalFree)} total free across all work-centers
      </p>
    </li>
  );
}

export function FreeCapacityPanel() {
  const { sessions } = useLabour();
  const capacity = usePhaseCapacity();
  const [now] = useState(() => new Date().toISOString().slice(0, 10));

  const history = sessions as unknown as CapacitySession[];

  const windows = useMemo(
    () => buildWeeklyWindows(history, capacity, now, DEFAULT_LOOKAHEAD_WEEKS),
    [history, capacity, now]
  );

  const slot = useMemo(() => findEarliestBookableStart(windows), [windows]);

  return (
    <div className="space-y-6" data-testid="free-capacity-panel">
      {/* Earliest bookable start banner */}
      <section className="rounded-2xl bg-surface p-5 shadow-resting">
        <header className="mb-3">
          <h2 className="text-base font-semibold text-text-primary">Earliest bookable start</h2>
          <p className="text-sm text-text-secondary">
            The first week where all work-centers have room to absorb a new job without exceeding
            any phase&apos;s capacity.
          </p>
        </header>

        {slot ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-status-on-track-soft bg-status-on-track-soft/30 p-4"
            data-testid="earliest-bookable-start"
            data-week-start={slot.weekStart}
          >
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-status-on-track" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                You can safely promise a new job starting{" "}
                <span className="font-semibold">{slot.label}</span>.
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                All six work-centers have at least 8h of free capacity that week.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex items-start gap-3 rounded-xl border border-status-blocked-soft bg-status-blocked-soft/30 p-4"
            data-testid="no-bookable-window"
          >
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-status-blocked" />
            <p className="text-sm text-text-secondary">
              No fully open window found in the next {DEFAULT_LOOKAHEAD_WEEKS} weeks. Consider
              reviewing your capacity settings or deferring new work.
            </p>
          </div>
        )}
      </section>

      {/* Per-week free-capacity breakdown */}
      <section className="rounded-2xl bg-surface p-5 shadow-resting">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Free capacity — next {DEFAULT_LOOKAHEAD_WEEKS} weeks
          </h2>
          <p className="text-sm text-text-secondary">
            Available hours per work-center, week by week. A week is{" "}
            <span className="font-medium text-status-on-track">bookable</span> when all six phases
            have at least one day (8h) free. Red = over capacity, amber = under 16h, green = room to
            spare.
          </p>
        </header>
        <ul className="space-y-3">
          {windows.map((w) => (
            <WindowRow key={w.weekStart} window={w} />
          ))}
        </ul>
      </section>
    </div>
  );
}
