"use client";

/**
 * S25 — PPC + on-time-delivery reliability scorecard + public reliability stat
 * (issue #113). Dark-shipped behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED.
 *
 * Shows three metrics side-by-side:
 *   1. PPC (Percent-Plan-Complete) — share of phase promises kept.
 *   2. On-time delivery rate — share of client install dates kept.
 *   3. Variance by reason — top shop-attributable reasons for misses.
 *
 * Plus an optional copyable "public reliability stat" for quotes/proposals.
 */

import { useState } from "react";
import { Check, Copy, TrendingUp, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useScorecardData } from "../lib/ppcStore";
import { formatReliabilityRate } from "../lib/ppc";

// ── Rate chip colour helper ───────────────────────────────────────────────────

function rateColour(rate: number): string {
  if (rate >= 0.85) return "text-status-on-track";
  if (rate >= 0.6) return "text-[#C99846]"; // amber / warning
  return "text-status-blocked";
}

function rateBackground(rate: number): string {
  if (rate >= 0.85) return "bg-status-on-track-soft";
  if (rate >= 0.6) return "bg-[#F7EBD5]";
  return "bg-status-blocked-soft";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  rate,
  kept,
  total,
  testId,
}: {
  label: string;
  rate: number;
  kept: number;
  total: number;
  testId: string;
}) {
  const pct = formatReliabilityRate(rate);
  return (
    <div
      data-testid={testId}
      data-rate={Math.floor(rate * 100)}
      className="flex flex-col gap-1"
    >
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums leading-none",
            rateColour(rate)
          )}
        >
          {pct}
        </span>
        <span className="text-xs text-text-tertiary tabular-nums">
          {kept}/{total}
        </span>
      </dd>
      <div
        className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden mt-0.5"
        role="progressbar"
        aria-valuenow={Math.floor(rate * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}`}
      >
        <div
          className={cn("h-full rounded-full transition-all", rateBackground(rate))}
          style={{ width: `${Math.floor(rate * 100)}%` }}
        />
      </div>
    </div>
  );
}

function EmptyMetric({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-tertiary">No data yet</dd>
    </div>
  );
}

function CopyableStatRow({ stat }: { stat: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(stat);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  return (
    <div
      data-testid="reliability-public-stat"
      className="rounded-lg border border-border bg-surface-muted p-4"
    >
      <div className="flex items-start gap-3">
        <TrendingUp
          className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary mb-1">
            Public reliability stat
          </p>
          <p
            data-testid="reliability-public-stat-text"
            className="text-sm text-text-primary italic"
          >
            {stat}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            Copy for quotes, proposals, or your website.
          </p>
        </div>
        <button
          type="button"
          data-testid="reliability-public-stat-copy"
          onClick={handleCopy}
          aria-label="Copy reliability stat"
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            copied
              ? "border-status-on-track bg-status-on-track-soft text-status-on-track"
              : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ReliabilityScorecardPanel() {
  const { scorecard, loading } = useScorecardData();

  return (
    <section
      data-testid="reliability-scorecard-panel"
      className="bg-surface rounded-xl shadow-resting p-6"
      aria-label="Reliability scorecard"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="h-4 w-4 text-text-tertiary shrink-0" strokeWidth={1.75} aria-hidden />
        <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Reliability scorecard
        </h2>
      </div>
      <p className="mb-5 text-xs text-text-tertiary leading-relaxed">
        Percent-Plan-Complete and on-time install delivery across all jobs.
        Variance reasons exclude scope changes and client-caused delays.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Key-rate metrics ── */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {scorecard?.ppc ? (
              <MetricTile
                label="Phase plan complete (PPC)"
                rate={scorecard.ppc.rate}
                kept={scorecard.ppc.kept}
                total={scorecard.ppc.total}
                testId="scorecard-ppc"
              />
            ) : (
              <EmptyMetric label="Phase plan complete (PPC)" />
            )}

            {scorecard?.onTimeDelivery ? (
              <MetricTile
                label="On-time delivery (install)"
                rate={scorecard.onTimeDelivery.rate}
                kept={scorecard.onTimeDelivery.kept}
                total={scorecard.onTimeDelivery.total}
                testId="scorecard-otd"
              />
            ) : (
              <EmptyMetric label="On-time delivery (install)" />
            )}
          </dl>

          {/* ── Variance by reason ── */}
          <div data-testid="scorecard-variance">
            <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Variance reasons (shop-attributable only)
            </h3>
            {scorecard && scorecard.varianceByReason.length > 0 ? (
              <ul className="space-y-1.5" aria-label="Variance by reason">
                {scorecard.varianceByReason.map((v) => (
                  <li
                    key={v.reasonCode}
                    data-testid={`variance-reason-${v.reasonCode}`}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="flex-1 text-text-secondary">{v.label}</span>
                    <span
                      className="tabular-nums font-medium text-text-primary"
                      aria-label={`${v.count} occurrences`}
                    >
                      {v.count}
                    </span>
                    {/* Inline bar scaled to the largest count */}
                    <div
                      className="w-16 h-1 rounded-full bg-surface-muted overflow-hidden"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-status-blocked-soft"
                        style={{
                          width: `${Math.min(100, (v.count / (scorecard.varianceByReason[0]?.count ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-text-tertiary">
                {scorecard ? "No attributable misses recorded yet." : "Loading…"}
              </p>
            )}
          </div>

          {/* ── Public reliability stat (optional) ── */}
          {scorecard?.publicReliabilityStat && (
            <CopyableStatRow stat={scorecard.publicReliabilityStat} />
          )}
        </div>
      )}
    </section>
  );
}
