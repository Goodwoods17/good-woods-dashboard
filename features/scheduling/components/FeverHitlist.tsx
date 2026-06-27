"use client";

/**
 * S9 — Shop-wide fever-chart hitlist + "one number to watch" (issue #97).
 *
 * Two sections:
 *   1. The "one number" banner — a large count of RED-zone jobs (commitments at risk).
 *      Non-PMs glance here; they don't need the 2D chart to know if they must act.
 *   2. A ranked table of every active job by buffer-health severity, coloured
 *      green/yellow/red with buffer-consumed % and days remaining visible.
 *
 * Renders nothing when SCHEDULING_ENABLED is off (caller should check, but we
 * guard again here so the component is safe to import anywhere).
 */

import Link from "next/link";
import { AlertTriangle, ThumbsUp, Minus, Star } from "lucide-react";
import type { Job } from "@shared/lib/types";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { schedulingEnabled } from "../lib/featureFlag";
import {
  buildFeverHitlist,
  type FeverHitlistEntry,
  type ShopHealthSummary,
} from "../lib/feverHitlist";
import type { FeverZone } from "../lib/bufferBurn";

// ── Zone styling ──────────────────────────────────────────────────────────────

const ZONE_ROW_BG: Record<FeverZone, string> = {
  red: "bg-rose-50 hover:bg-rose-100/80",
  yellow: "bg-amber-50 hover:bg-amber-100/80",
  green: "bg-emerald-50/40 hover:bg-emerald-100/50",
};

const ZONE_PILL: Record<
  FeverZone,
  { bg: string; text: string; label: string; icon?: React.ElementType }
> = {
  red: { bg: "bg-rose-100 text-rose-700", text: "text-rose-700", label: "At risk" },
  yellow: { bg: "bg-amber-100 text-amber-700", text: "text-amber-700", label: "Warning" },
  green: { bg: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", label: "On track" },
};

// ── Public component ─────────────────────────────────────────────────────────

export function FeverHitlist({ jobs }: { jobs: Job[] }) {
  if (!schedulingEnabled()) return null;

  const { entries, summary } = buildFeverHitlist(jobs, new Date());

  return (
    <div data-testid="fever-hitlist" className="space-y-4">
      <OneNumber summary={summary} />
      <RankedBoard entries={entries} />
    </div>
  );
}

// ── "One number to watch" banner ─────────────────────────────────────────────

function OneNumber({ summary }: { summary: ShopHealthSummary }) {
  const { commitmentsAtRisk, yellowCount, greenCount, totalUnscheduled, totalScheduled } =
    summary;
  const allClear = commitmentsAtRisk === 0 && yellowCount === 0;

  return (
    <section
      data-testid="fever-one-number"
      aria-label="Shop health summary"
      className={cn(
        "rounded-xl shadow-resting p-5 flex flex-wrap items-center gap-6",
        commitmentsAtRisk > 0
          ? "bg-rose-50 border border-rose-200"
          : yellowCount > 0
            ? "bg-amber-50 border border-amber-200"
            : "bg-surface border border-border"
      )}
    >
      {/* Primary number */}
      <div className="flex items-baseline gap-3 min-w-[10rem]">
        <span
          data-testid="fever-commitments-at-risk"
          className={cn(
            "text-5xl font-bold tabular-nums",
            commitmentsAtRisk > 0
              ? "text-rose-600"
              : yellowCount > 0
                ? "text-amber-600"
                : "text-emerald-600"
          )}
        >
          {commitmentsAtRisk}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">
            {commitmentsAtRisk === 1 ? "commitment" : "commitments"}
          </span>
          <span className="text-xs text-text-secondary">at risk</span>
        </div>
      </div>

      {/* Supporting stats */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        {commitmentsAtRisk > 0 && (
          <Stat
            icon={AlertTriangle}
            iconClass="text-rose-500"
            value={commitmentsAtRisk}
            label={`red${commitmentsAtRisk === 1 ? "" : ""}`}
          />
        )}
        {yellowCount > 0 && (
          <Stat
            icon={AlertTriangle}
            iconClass="text-amber-500"
            value={yellowCount}
            label="warning"
          />
        )}
        {greenCount > 0 && (
          <Stat
            icon={ThumbsUp}
            iconClass="text-emerald-500"
            value={greenCount}
            label="on track"
          />
        )}
        {totalUnscheduled > 0 && (
          <Stat
            icon={Minus}
            iconClass="text-text-tertiary"
            value={totalUnscheduled}
            label="not scheduled"
          />
        )}
      </div>

      {allClear && totalScheduled > 0 && (
        <span className="text-sm text-emerald-700 font-medium ml-auto">
          All commitments healthy — no action needed.
        </span>
      )}
    </section>
  );
}

function Stat({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: React.ElementType;
  iconClass: string;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-text-secondary">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClass)} strokeWidth={2} />
      <span className="tabular-nums font-medium text-text-primary">{value}</span>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

// ── Ranked board ──────────────────────────────────────────────────────────────

function RankedBoard({ entries }: { entries: FeverHitlistEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow-resting px-5 py-10 text-center text-sm text-text-secondary">
        No active jobs to rank.
      </div>
    );
  }

  return (
    <section
      data-testid="fever-board"
      className="bg-surface rounded-xl shadow-resting overflow-hidden"
    >
      {/* Header */}
      <header className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-border-faint bg-surface-muted/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Job
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary w-20 text-right">
          Chain %
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary w-24 text-right">
          Buffer used
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary w-20 text-right">
          Buffer left
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary w-28 text-right">
          Install
        </span>
      </header>

      <ol>
        {entries.map((entry, i) => (
          <BoardRow key={entry.job.id} entry={entry} rank={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function BoardRow({ entry, rank }: { entry: FeverHitlistEntry; rank: number }) {
  const { job, zone, chainCompletionPct: chain, bufferConsumedPct, remainingBufferDays } = entry;

  const rowBg = zone ? ZONE_ROW_BG[zone] : "hover:bg-surface-muted/40";
  const pill = zone ? ZONE_PILL[zone] : null;

  const bufferLabel =
    remainingBufferDays > 0
      ? `${remainingBufferDays}d left`
      : remainingBufferDays === 0
        ? "0d"
        : `${Math.abs(remainingBufferDays)}d over`;

  return (
    <li className={cn("border-b border-border last:border-0 transition-colors duration-fast", rowBg)}>
      <Link
        href={`/jobs/${job.id}`}
        className="grid grid-cols-[28px_1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-3 group"
        aria-label={`${job.name} — ${zone ?? "unscheduled"}`}
      >
        {/* Rank */}
        <span className="text-xs tabular-nums text-text-tertiary text-center">{rank}</span>

        {/* Job info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
              {job.name}
            </span>
            {/* S17: Priority/VIP badge — surfaces first in capacity conflicts */}
            {job.isPriority && (
              <span
                data-testid={`priority-badge-${job.id}`}
                title="Priority / VIP — surfaces first in capacity conflicts"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 bg-amber-100 text-amber-700"
              >
                <Star className="h-2.5 w-2.5 fill-amber-500 stroke-amber-600" strokeWidth={1.5} />
                VIP
              </span>
            )}
            {pill && (
              <span
                data-testid={`fever-zone-pill-${job.id}`}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                  pill.bg
                )}
              >
                {pill.label}
              </span>
            )}
            {!zone && (
              <span
                data-testid={`fever-zone-pill-${job.id}`}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 bg-surface-muted text-text-tertiary"
              >
                Not scheduled
              </span>
            )}
          </div>
          <div className="text-xs text-text-secondary mt-0.5">{job.client}</div>
        </div>

        {/* Chain completion % */}
        <div className="w-20 text-right">
          {zone ? (
            <span className="text-sm tabular-nums text-text-primary font-medium">
              {Math.round(chain)}%
            </span>
          ) : (
            <span className="text-text-tertiary text-sm">—</span>
          )}
        </div>

        {/* Buffer consumed % */}
        <div className="w-24 text-right">
          {zone ? (
            <span
              className={cn(
                "text-sm tabular-nums font-medium",
                zone === "red"
                  ? "text-rose-600"
                  : zone === "yellow"
                    ? "text-amber-600"
                    : "text-emerald-600"
              )}
            >
              {Math.round(bufferConsumedPct)}%
            </span>
          ) : (
            <span className="text-text-tertiary text-sm">—</span>
          )}
        </div>

        {/* Remaining buffer */}
        <div className="w-20 text-right">
          {zone ? (
            <span
              className={cn(
                "text-xs tabular-nums",
                remainingBufferDays < 0 ? "text-rose-600 font-semibold" : "text-text-secondary"
              )}
            >
              {bufferLabel}
            </span>
          ) : (
            <span className="text-text-tertiary text-xs">—</span>
          )}
        </div>

        {/* Install date */}
        <div className="w-28 text-right">
          <span className="text-xs tabular-nums text-text-secondary">
            {formatDate(job.installDate)}
          </span>
        </div>
      </Link>
    </li>
  );
}
