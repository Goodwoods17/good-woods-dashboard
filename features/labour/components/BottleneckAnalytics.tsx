"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Check } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  useLabour,
  formatDuration,
  formatMinutes,
  type MinuteSuggestion,
} from "@features/labour/lib/labourStore";

export function BottleneckAnalytics() {
  const { categoryStats, operationStats, suggestions, applySuggestion } = useLabour();

  const hasData = operationStats.some((s) => s.count > 0);
  const maxCat = Math.max(1, ...categoryStats.map((s) => s.totalMs));
  const maxOp = Math.max(1, ...operationStats.map((s) => s.totalMs));

  return (
    <div className="space-y-4">
      {/* Estimator auto-suggest */}
      {suggestions.length > 0 && (
        <section className="rounded-2xl bg-surface p-4 shadow-resting">
          <h3 className="mb-1 font-serif text-title font-medium text-text-primary">
            Estimator nudges
          </h3>
          <p className="mb-3 text-xs text-text-tertiary">
            Your tracked minutes drifted from the estimator&rsquo;s cabinet defaults. Apply to keep
            quotes honest.
          </p>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <SuggestionCard key={s.cabinetType} s={s} onApply={() => applySuggestion(s)} />
            ))}
          </div>
        </section>
      )}

      {!hasData && (
        <section className="rounded-2xl bg-surface p-8 text-center shadow-resting">
          <p className="text-sm text-text-tertiary">
            No completed sessions yet. Run a few timers and the bottleneck breakdown shows up here.
          </p>
        </section>
      )}

      {/* By category */}
      {hasData && (
        <section className="rounded-2xl bg-surface p-4 shadow-resting">
          <h3 className="mb-3 font-serif text-title font-medium text-text-primary">By category</h3>
          <div className="space-y-2.5">
            {categoryStats
              .filter((s) => s.count > 0)
              .map((s) => (
                <Bar
                  key={s.category.id}
                  label={s.category.label}
                  totalMs={s.totalMs}
                  max={maxCat}
                  meta={`${s.count}× · avg ${formatDuration(s.avgMs)}`}
                />
              ))}
          </div>
        </section>
      )}

      {/* By operation */}
      {hasData && (
        <section className="rounded-2xl bg-surface p-4 shadow-resting">
          <h3 className="mb-3 font-serif text-title font-medium text-text-primary">By operation</h3>
          <div className="space-y-2.5">
            {operationStats
              .filter((s) => s.count > 0 || s.running > 0)
              .map((s) => (
                <Bar
                  key={s.operation.id}
                  label={s.operation.name}
                  totalMs={s.totalMs}
                  max={maxOp}
                  accent={s.category?.label}
                  meta={
                    s.count > 0
                      ? `${s.count}× · avg ${formatDuration(s.avgMs)}${
                          s.running ? ` · ${s.running} running` : ""
                        }`
                      : `${s.running} running`
                  }
                />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Bar({
  label,
  totalMs,
  max,
  meta,
  accent,
}: {
  label: string;
  totalMs: number;
  max: number;
  meta: string;
  accent?: string;
}) {
  const pct = Math.max(2, Math.round((totalMs / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-text-primary">
          {label}
          {accent && <span className="ml-1.5 text-xs text-text-tertiary">{accent}</span>}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
          {formatDuration(totalMs)} <span className="text-text-tertiary">· {meta}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-base"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SuggestionCard({ s, onApply }: { s: MinuteSuggestion; onApply: () => void }) {
  const up = s.actualMinutes > s.currentMinutes;
  const [applied, setApplied] = useState(false);
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted/40 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full",
            up
              ? "bg-status-at-risk-soft text-status-at-risk"
              : "bg-status-on-track-soft text-status-on-track"
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 text-sm">
          <div className="truncate text-text-primary">
            <span className="font-medium capitalize">{s.cabinetType}</span> assembly runs{" "}
            <span className="font-medium">{formatMinutes(s.actualMinutes)}</span>, not{" "}
            {formatMinutes(s.currentMinutes)}
          </div>
          <div className="text-xs text-text-tertiary">
            {s.operationName} · {s.sampleSize} sessions
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={applied}
        onClick={() => {
          onApply();
          setApplied(true);
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
          applied
            ? "bg-status-on-track-soft text-status-on-track"
            : "bg-ink-pill text-white hover:opacity-90"
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
        {applied ? "Applied" : "Apply"}
      </button>
    </div>
  );
}
