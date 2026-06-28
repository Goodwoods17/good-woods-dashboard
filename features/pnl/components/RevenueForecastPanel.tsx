"use client";

/**
 * S24 — P&L revenue forecast by committed date + buffer burn (issue #112).
 *
 * Dark-shipped behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED (off in prod).
 * Rendered from PnlView only when schedulingP6Enabled() is true.
 *
 * Two scenarios side-by-side:
 *   Hold — revenue lands in the month of each committed install date.
 *   Slip — if jobs are burning buffer, their revenue shifts to the
 *          projected later month based on today's buffer consumption.
 *
 * A separate "Buffer burn" list surfaces jobs with active buffer
 * consumption so the owner can see where cash-flow risk originates.
 */

import { useMemo } from "react";
import { formatCAD } from "@shared/lib/format";
import { computeRevenueForecast, type JobForecastStatus } from "@features/pnl/lib/revenueForecast";
import type { Job } from "@shared/lib/types";

// ── Severity colour helpers ──────────────────────────────────────────────────

function burnSeverity(pct: number): "none" | "low" | "medium" | "high" {
  if (pct <= 0) return "none";
  if (pct < 50) return "low";
  if (pct < 100) return "medium";
  return "high";
}

const SEVERITY_CLASSES: Record<ReturnType<typeof burnSeverity>, string> = {
  none: "bg-surface-muted text-text-tertiary",
  low: "bg-[#F7EBD5] text-[#C99846]",
  medium: "bg-[#FADBD7] text-[#D14D3F]",
  high: "bg-[#F2DDDA] text-[#B5544C]",
};

const SEVERITY_LABELS: Record<ReturnType<typeof burnSeverity>, string> = {
  none: "On track",
  low: "Low risk",
  medium: "At risk",
  high: "Critical",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-micro uppercase tracking-[0.08em] text-text-tertiary">{children}</dt>
  );
}

function MoneyValue({ amount, dim }: { amount: number; dim?: boolean }) {
  return (
    <span
      className={`font-mono text-sm tabular-nums ${dim ? "text-text-tertiary" : "text-text-primary"}`}
    >
      {formatCAD(amount)}
    </span>
  );
}

function BufferBurnRow({ status }: { status: JobForecastStatus }) {
  const sev = burnSeverity(status.bufferConsumedPct);
  const pill = SEVERITY_CLASSES[sev];
  const pillLabel = SEVERITY_LABELS[sev];

  return (
    <li
      className="flex items-center gap-3 py-2.5 border-b border-border-faint last:border-0"
      data-testid={`buffer-burn-row-${status.jobId}`}
      data-severity={sev}
    >
      {/* Job name + committed date */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary font-medium truncate">{status.jobName}</p>
        <p className="text-xs text-text-tertiary mt-0.5">
          Committed {new Date(status.committedDate + "T12:00:00").toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {status.slipsToKey && (
            <span className="ml-1 text-[#C99846]">
              · slips to{" "}
              {new Date(status.projectedDate! + "T12:00:00").toLocaleDateString("en-CA", {
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </p>
      </div>

      {/* Buffer consumed bar */}
      <div className="hidden sm:block w-24">
        <div className="h-1.5 rounded-full bg-border-faint overflow-hidden">
          <div
            className="h-full rounded-full bg-[#C99846]"
            style={{ width: `${Math.min(100, status.bufferConsumedPct).toFixed(0)}%` }}
            aria-hidden
          />
        </div>
        <p className="text-micro text-text-tertiary mt-0.5 text-right tabular-nums">
          {status.consumedBufferDays}d / {status.totalBufferDays}d
        </p>
      </div>

      {/* Status pill */}
      <span
        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium ${pill}`}
        data-testid={`buffer-burn-severity-${status.jobId}`}
      >
        {pillLabel}
      </span>

      {/* Revenue at risk */}
      <div className="w-24 text-right">
        <MoneyValue amount={status.revenue} />
      </div>
    </li>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function RevenueForecastPanel({ jobs }: { jobs: Job[] }) {
  const today = useMemo(() => new Date(), []);
  const forecast = useMemo(() => computeRevenueForecast(jobs, today), [jobs, today]);

  if (forecast.buckets.length === 0) {
    return (
      <section
        className="bg-surface rounded-2xl shadow-resting p-5 md:p-6"
        data-testid="revenue-forecast-panel"
      >
        <h2 className="font-serif text-title font-medium text-text-primary mb-1">
          Revenue forecast
        </h2>
        <p className="text-sm text-text-tertiary">No jobs with install dates to forecast.</p>
      </section>
    );
  }

  const hasSlippage = forecast.buckets.some((b) => b.holdRevenue !== b.slipRevenue);
  const atRiskJobs = forecast.jobStatuses.filter((s) => s.consumedBufferDays > 0);

  return (
    <section
      className="bg-surface rounded-2xl shadow-resting p-5 md:p-6 space-y-6"
      data-testid="revenue-forecast-panel"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-serif text-title font-medium text-text-primary">
            Revenue forecast
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Committed install dates as the revenue signal.{" "}
            <span className="font-medium text-text-secondary">Hold</span> = if all schedules hold.{" "}
            <span className="font-medium text-[#C99846]">Slip</span> = if current buffer burn
            continues.
          </p>
        </div>
        {forecast.atRiskRevenue > 0 && (
          <dl className="shrink-0 text-right">
            <SectionLabel>At risk</SectionLabel>
            <dd className="font-mono text-sm tabular-nums text-[#C99846] font-medium">
              {formatCAD(forecast.atRiskRevenue)}
            </dd>
          </dl>
        )}
      </div>

      {/* Hold vs. Slip comparison table */}
      <div
        className="overflow-x-auto -mx-1"
        aria-label="Revenue scenarios by month"
        data-testid="forecast-table"
      >
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-border-faint">
              <th className="text-left pb-2 text-micro uppercase tracking-[0.08em] text-text-tertiary font-medium w-24">
                Month
              </th>
              <th className="text-right pb-2 text-micro uppercase tracking-[0.08em] text-text-tertiary font-medium w-28">
                Hold
              </th>
              <th className="text-right pb-2 text-micro uppercase tracking-[0.08em] text-text-tertiary font-medium w-28">
                Slip
              </th>
              {hasSlippage && (
                <th className="text-right pb-2 text-micro uppercase tracking-[0.08em] text-text-tertiary font-medium w-20">
                  Diff
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {forecast.buckets.map((bucket) => {
              const diff = bucket.slipRevenue - bucket.holdRevenue;
              const isShifted = diff !== 0;

              return (
                <tr
                  key={bucket.key}
                  className="border-b border-border-faint last:border-0"
                  data-testid={`forecast-row-${bucket.key}`}
                >
                  <td className="py-2.5 text-text-secondary text-sm">{bucket.label}</td>
                  <td className="py-2.5 text-right">
                    <MoneyValue amount={bucket.holdRevenue} dim={bucket.holdRevenue === 0} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        isShifted
                          ? bucket.slipRevenue < bucket.holdRevenue
                            ? "text-[#C99846]"
                            : "text-status-on-track"
                          : "text-text-primary"
                      }`}
                    >
                      {formatCAD(bucket.slipRevenue)}
                    </span>
                  </td>
                  {hasSlippage && (
                    <td className="py-2.5 text-right">
                      {isShifted ? (
                        <span
                          className={`font-mono text-sm tabular-nums ${
                            diff > 0 ? "text-status-on-track" : "text-[#C99846]"
                          }`}
                          data-testid={`forecast-diff-${bucket.key}`}
                        >
                          {diff > 0 ? "+" : ""}
                          {formatCAD(diff)}
                        </span>
                      ) : (
                        <span className="text-text-tertiary text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td className="pt-2.5 text-micro uppercase tracking-[0.08em] text-text-tertiary font-medium">
                Total
              </td>
              <td className="pt-2.5 text-right">
                <MoneyValue amount={forecast.totalRevenue} />
              </td>
              <td className="pt-2.5 text-right">
                <MoneyValue amount={forecast.totalRevenue} />
              </td>
              {hasSlippage && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Buffer-burn list — only shown when there are at-risk jobs */}
      {atRiskJobs.length > 0 && (
        <div data-testid="buffer-burn-list">
          <h3 className="text-label font-medium text-text-primary mb-3">
            Buffer burn — cash-flow risk
          </h3>
          <p className="text-xs text-text-tertiary mb-3">
            Jobs consuming buffer today. Revenue in these jobs may shift to a later month if
            slippage continues.
          </p>
          <ul className="divide-y-0" aria-label="At-risk jobs by buffer consumption">
            {atRiskJobs.map((status) => (
              <BufferBurnRow key={status.jobId} status={status} />
            ))}
          </ul>
        </div>
      )}

      {!hasSlippage && forecast.jobStatuses.length > 0 && (
        <p className="text-xs text-status-on-track">
          All scheduled jobs are within their buffer. Revenue forecast is as committed.
        </p>
      )}
    </section>
  );
}
