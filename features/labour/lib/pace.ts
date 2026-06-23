// Pace utilities for the real-time timer (ADR 0011). The "suggested time" a
// running Session is measured against, the band it falls into, and the status
// tones for each band. Kept separate from labourStore so /labour and (later)
// the shop-floor kanban cards share one source of truth.

import { durationMs, type LabourOperation, type LabourSession } from "./labourStore";

export type PaceBand = "on_track" | "at_risk" | "blocked" | "paused";
export type SuggestedSource = "history" | "estimate" | "default";
export type Suggested = {
  minutes: number | null; // whole-task suggested minutes (null = no target to pace against)
  source: SuggestedSource | null;
  sampleCount: number; // completed Sessions behind a 'history' figure (0 otherwise)
};

// Outlier-trimmed mean: once there are ≥4 samples, drop any beyond ~3× the
// median so one forgotten-running timer can't poison the suggested time.
function trimmedMean(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length < 4) return values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = sorted.filter((v) => v <= median * 3);
  const use = kept.length > 0 ? kept : sorted;
  return use.reduce((a, b) => a + b, 0) / use.length;
}

// The suggested time for a code: outlier-trimmed historical average (per-unit ×
// target for driven codes) → else the job's bid estimate → else the hand-set
// default → else null (plain stopwatch). `completed` = this op's stopped Sessions.
export function suggestedMinutes(
  op: LabourOperation,
  completed: LabourSession[],
  targetQty?: number | null,
  budgetMinutes?: number | null
): Suggested {
  if (op.driverUnit) {
    const perUnit = completed
      .filter((s) => s.quantity != null && s.quantity > 0)
      .map((s) => durationMs(s) / 60000 / (s.quantity as number));
    const avgPerUnit = trimmedMean(perUnit);
    if (avgPerUnit != null) {
      const minutes = targetQty && targetQty > 0 ? avgPerUnit * targetQty : avgPerUnit;
      return { minutes, source: "history", sampleCount: perUnit.length };
    }
  } else {
    const mins = completed.map((s) => durationMs(s) / 60000);
    const avg = trimmedMean(mins);
    if (avg != null) return { minutes: avg, source: "history", sampleCount: mins.length };
  }
  if (budgetMinutes != null && budgetMinutes > 0) {
    return { minutes: budgetMinutes, source: "estimate", sampleCount: 0 };
  }
  if (op.defaultMinutes != null && op.defaultMinutes > 0) {
    const minutes =
      op.driverUnit && targetQty && targetQty > 0
        ? op.defaultMinutes * targetQty
        : op.defaultMinutes;
    return { minutes, source: "default", sampleCount: 0 };
  }
  return { minutes: null, source: null, sampleCount: 0 };
}

// Pace band from active time vs suggested minutes. amber at 80%, red at 100%.
export function paceBand(
  activeMs: number,
  suggestedMin: number | null,
  paused: boolean
): PaceBand | null {
  if (paused) return "paused";
  if (suggestedMin == null || suggestedMin <= 0) return null;
  const ratio = activeMs / (suggestedMin * 60000);
  if (ratio > 1) return "blocked";
  if (ratio >= 0.8) return "at_risk";
  return "on_track";
}

// Status tones, aligned to the app's existing HealthPill / MarginCell vocabulary.
export const PACE_TONE: Record<PaceBand, { bg: string; text: string; dot: string; bar: string }> = {
  on_track: {
    bg: "bg-status-on-track-soft",
    text: "text-status-on-track",
    dot: "bg-status-on-track",
    bar: "bg-status-on-track",
  },
  at_risk: {
    bg: "bg-status-at-risk-soft",
    text: "text-status-at-risk",
    dot: "bg-status-at-risk",
    bar: "bg-status-at-risk",
  },
  blocked: {
    bg: "bg-status-blocked-soft",
    text: "text-status-blocked",
    dot: "bg-status-blocked",
    bar: "bg-status-blocked",
  },
  paused: {
    bg: "bg-surface-muted",
    text: "text-status-paused",
    dot: "bg-status-paused",
    bar: "bg-status-paused",
  },
};
