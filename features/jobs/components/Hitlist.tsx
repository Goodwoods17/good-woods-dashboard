"use client";

// Hitlist / Action Queue — the default homepage view.
// Top: "This week's hitlist" — most urgent next actions across active jobs,
// ranked by health × install proximity. Each row leads with the next step.
// Below: the rest of the pipeline, compact.
//
// Blocker + next-step text is currently SYNTHETIC (see lib/blockers.ts).
// Rendered with a "demo" tag so it isn't mistaken for real data.

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Flame } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type Job } from "@shared/lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";
import { HealthPill } from "@shared/components/ui/HealthPill";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { DemoTag } from "@shared/components/ui/DemoTag";
import { cn } from "@shared/lib/utils";
import { buildHitlist, isSyntheticBlocker, type HitlistEntry } from "@features/jobs/lib/blockers";
import { BlockerChip } from "@features/jobs/components/BlockerChip";
import { deriveHealth } from "@features/jobs/lib/health";
import { useJobBlockers } from "@features/jobs/lib/jobBlockersStore";

// FLIP transition for row reorder + enter/exit on health-driven moves.
// Duration + curve match DESIGN.md §3.6 motion vocabulary (ease-emphasized,
// duration-base scaled up slightly for the snap to be noticeable but quiet).
const REORDER_TRANSITION = {
  layout: { duration: 0.24, ease: [0.3, 0, 0, 1] as const },
  opacity: { duration: 0.18, ease: [0.3, 0, 0, 1] as const },
} as const;

const TOP_N = 8;

export function Hitlist({ jobs }: { jobs: Job[] }) {
  const { activeByJob } = useJobBlockers();
  const entries = useMemo(() => buildHitlist(jobs, new Date(), activeByJob), [jobs, activeByJob]);
  const top = entries.slice(0, TOP_N);
  const rest = entries.slice(TOP_N);
  const reduceMotion = useReducedMotion();

  const exposure = top.reduce((s, e) => s + e.job.revenue, 0);
  const blockedCount = top.filter(
    (e) => deriveHealth(e.job, new Date(), activeByJob.get(e.job.id) ?? []) === "blocked"
  ).length;

  return (
    <div className="space-y-5">
      <section className="bg-surface rounded-xl shadow-resting overflow-hidden">
        <header className="px-5 py-4 border-b border-border-faint flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-accent" strokeWidth={2} />
              <h3 className="font-serif text-lg font-medium text-text-primary tracking-[-0.01em]">
                This week&rsquo;s hitlist
              </h3>
            </div>
            <span className="text-xs text-text-tertiary tabular-nums">
              {top.length} job{top.length === 1 ? "" : "s"} · {formatCAD(exposure)} on the line
            </span>
          </div>
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-status-blocked">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
              {blockedCount} blocked
            </span>
          )}
        </header>
        {top.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-secondary">
            All clear. Nothing waiting on you right now.
          </div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {top.map((entry, i) => (
                <HitlistRow
                  key={entry.job.id}
                  entry={entry}
                  index={i + 1}
                  reduceMotion={reduceMotion}
                  activeBlockers={activeByJob.get(entry.job.id) ?? []}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section className="bg-surface rounded-xl shadow-resting overflow-hidden">
          <header className="px-5 py-3 border-b border-border-faint">
            <h3 className="text-label font-semibold uppercase text-text-tertiary">
              Rest of pipeline · {rest.length}
            </h3>
          </header>
          <ul>
            <AnimatePresence initial={false}>
              {rest.map((entry) => (
                <RestRow key={entry.job.id} entry={entry} reduceMotion={reduceMotion} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {entries.some((e) => isSyntheticBlocker(e.job, activeByJob.get(e.job.id) ?? [])) && (
        <p className="text-xs text-text-tertiary px-1">
          Rows marked <DemoTag inline /> use a synthetic blocker fallback. Open the job and set the
          real blocker + next step to retire the tag.
        </p>
      )}
    </div>
  );
}

function HitlistRow({
  entry,
  index,
  reduceMotion,
  activeBlockers,
}: {
  entry: HitlistEntry;
  index: number;
  reduceMotion: boolean | null;
  activeBlockers: import("@shared/lib/types").JobBlocker[];
}) {
  const { job, nextStep, daysToInstall } = entry;
  const health = deriveHealth(job, new Date(), activeBlockers);
  const installLabel =
    daysToInstall < 0
      ? `${Math.abs(daysToInstall)}d overdue`
      : daysToInstall === 0
        ? "Installs today"
        : daysToInstall <= 7
          ? `${daysToInstall}d to install`
          : formatDate(job.installDate);
  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
      transition={REORDER_TRANSITION}
      className="border-b border-border last:border-0"
    >
      <Link
        href={`/jobs/${job.id}`}
        className="group grid grid-cols-[28px_1fr_auto] items-center gap-4 px-4 py-3 hover:bg-surface-muted/40 transition-colors duration-fast"
      >
        <span className="text-xs tabular-nums text-text-tertiary text-center">{index}</span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors duration-fast">
              {nextStep}
            </span>
            <BlockerChip job={job} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="text-text-secondary font-medium">{job.name}</span>
            <span>·</span>
            <span>{job.client}</span>
            <span>·</span>
            <StatusBadge status={job.pipelineStatus} />
            <span>·</span>
            <span className="tabular-nums">{installLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right tabular-nums">
            <div className="text-sm text-text-primary font-medium">{formatCAD(job.revenue)}</div>
            <div className="text-caption text-text-tertiary">at risk</div>
          </div>
          <HealthPill status={health} />
          <ArrowRight
            className="h-4 w-4 text-text-tertiary group-hover:text-accent transition-colors duration-fast"
            strokeWidth={1.75}
          />
        </div>
      </Link>
    </motion.li>
  );
}

function RestRow({ entry, reduceMotion }: { entry: HitlistEntry; reduceMotion: boolean | null }) {
  const { job, nextStep } = entry;
  return (
    <motion.li
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={REORDER_TRANSITION}
      className="border-b border-border last:border-0"
    >
      <Link
        href={`/jobs/${job.id}`}
        className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 hover:bg-surface-muted/40 transition-colors duration-fast group"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary font-medium truncate group-hover:text-accent transition-colors duration-fast">
              {job.name}
            </span>
            <span className="text-xs text-text-tertiary truncate">· {job.client}</span>
          </div>
          <div className="text-xs text-text-secondary truncate mt-0.5">{nextStep}</div>
        </div>
        <BlockerChip job={job} subtle />
        <div className="text-xs text-text-tertiary tabular-nums w-24 text-right">
          {formatDate(job.installDate)}
        </div>
      </Link>
    </motion.li>
  );
}
