"use client";

// Real-time pace timer card (ADR 0011). Reusable + presentational: it takes
// data + callbacks, not store access, so /labour and (later) the shop-floor
// kanban can both render it. Shows live active time, pause/resume/stop, a
// suggested-time chip (historical avg + bid estimate), a pace-toned progress
// bar, and a one-shot pulse the moment it crosses the suggested time.

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { Pill } from "@shared/components/ui/Pill";
import {
  durationMs,
  isPaused as isPausedSession,
  formatDuration,
  formatMinutes,
  type LabourSession,
} from "@features/labour/lib/labourStore";
import { paceBand, PACE_TONE, type PaceBand, type Suggested } from "@features/labour/lib/pace";
import { DRIVER_UNIT_LABELS, type DriverUnit } from "@features/job-costing/lib/types";

export function TaskTimer({
  session,
  title,
  meta,
  driverUnit,
  suggested,
  estimateMinutes,
  now,
  onPause,
  onResume,
  onStop,
}: {
  session: LabourSession;
  title: string;
  meta?: { category?: string | null; worker?: string | null; job?: string | null };
  driverUnit: DriverUnit | null;
  suggested: Suggested;
  estimateMinutes: number | null;
  now: number;
  onPause: () => void;
  onResume: () => void;
  onStop: (quantity?: number | null) => void;
}) {
  const paused = isPausedSession(session);
  const active = durationMs(session, now);
  const band = paceBand(active, suggested.minutes, paused);
  const tone = band ? PACE_TONE[band] : null;

  // Driven codes ask "how many?" before stopping, so per-unit averages build up.
  const [confirming, setConfirming] = useState(false);
  const [qty, setQty] = useState("");

  // One-shot pulse on the upward edge into "blocked" (over the suggested time).
  const prevBand = useRef<PaceBand | null>(band);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const prev = prevBand.current;
    if (band === "blocked" && prev !== "blocked" && prev !== "paused") setPulse(true);
    prevBand.current = band;
  }, [band]);

  const stop = () => {
    if (driverUnit && !confirming) {
      setConfirming(true);
      return;
    }
    if (driverUnit) {
      const n = qty.trim() === "" ? null : Number(qty);
      onStop(typeof n === "number" && Number.isFinite(n) ? n : null);
    } else {
      onStop();
    }
  };

  const pct = suggested.minutes ? Math.min(1, active / (suggested.minutes * 60000)) : 0;

  return (
    <div
      onAnimationEnd={() => setPulse(false)}
      className={cn(
        "rounded-xl border p-3 transition-colors duration-base",
        pulse && "animate-pace-crossover",
        tone ? cn(tone.bg, "border-transparent") : "border-accent-soft bg-accent-soft/20",
        paused && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-text-primary">{title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
            {meta?.category && (
              <span className="rounded-full bg-surface px-1.5 py-0.5">{meta.category}</span>
            )}
            {meta?.worker && <span>{meta.worker}</span>}
            {meta?.job && <span className="truncate">· {meta.job}</span>}
          </div>
        </div>
        {!confirming && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={paused ? onResume : onPause}
              aria-label={paused ? "Resume" : "Pause"}
              className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-text-secondary shadow-resting transition-colors duration-fast hover:text-text-primary"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />
              ) : (
                <Pause className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-pill px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-fast hover:opacity-90"
            >
              <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
              Stop
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-2xl font-medium tabular-nums",
            paused ? "text-text-tertiary" : (tone?.text ?? "text-text-primary")
          )}
        >
          {formatDuration(active, true)}
        </span>
        {paused && <Pill tone={PACE_TONE.paused} label="Paused" size="sm" />}
      </div>

      {/* Suggested time + bid estimate */}
      {(suggested.minutes != null || estimateMinutes != null) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {suggested.minutes != null && tone && (
            <Pill
              tone={tone}
              size="sm"
              label={
                <span className="tabular-nums">
                  {`≈ ${formatMinutes(suggested.minutes)} ${suggested.source === "history" ? "avg" : suggested.source === "estimate" ? "bid" : "est"}`}
                  {suggested.source === "history" && suggested.sampleCount > 0 && (
                    <span className="opacity-70"> · {suggested.sampleCount}</span>
                  )}
                </span>
              }
            />
          )}
          {estimateMinutes != null && suggested.source !== "estimate" && (
            <span className="font-mono tabular-nums text-text-tertiary">
              bid {formatMinutes(estimateMinutes)}
            </span>
          )}
          {driverUnit && session.targetQuantity != null && (
            <span className="text-text-tertiary">
              target {session.targetQuantity} {DRIVER_UNIT_LABELS[driverUnit]}
            </span>
          )}
        </div>
      )}

      {/* Pace progress bar (time vs suggested) */}
      {suggested.minutes != null && tone && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-base", tone.bar)}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}

      {confirming && driverUnit && (
        <div className="mt-2 flex items-center gap-2 border-t border-border-faint pt-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && stop()}
            placeholder={session.targetQuantity != null ? String(session.targetQuantity) : "0"}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          <span className="text-xs text-text-tertiary">{DRIVER_UNIT_LABELS[driverUnit]} done</span>
          <button
            type="button"
            onClick={stop}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-pill px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
