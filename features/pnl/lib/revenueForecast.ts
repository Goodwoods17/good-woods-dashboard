/**
 * S24 — P&L revenue forecast by committed date + buffer burn (issue #112).
 *
 * Two cash-flow scenarios derived from the Scheduling & Client-Commitment
 * Engine's data:
 *
 *   Hold:  revenue lands in the calendar month of each job's COMMITTED
 *          install date (the frozen client promise). This is what we told
 *          the client — the optimistic ceiling.
 *
 *   Slip:  if a job is currently consuming buffer (today has crossed the
 *          internal target date), we project the revenue forward by the
 *          number of buffer-days already burned. When that forward shift
 *          crosses a month boundary, the revenue "slips" to a later bucket.
 *          Jobs with no buffer burn stay in the same month as hold.
 *
 * Ships behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED (dark-ship, gated). All
 * monetary values are plain numbers here; callers must format via formatCAD.
 *
 * Pure + side-effect-free: no Supabase, no window, testable in Jest/Vitest.
 */

import type { Job } from "@shared/lib/types";
import { workDaysBetween, addWorkDays } from "@shared/lib/workdays";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * One calendar-month bucket combining both forecast scenarios so the view can
 * present them side-by-side. Either holdRevenue or slipRevenue may be 0 when
 * no job lands in that month for a given scenario.
 */
export type ForecastBucket = {
  /** YYYY-MM — sortable key for each month. */
  key: string;
  /** Short human-readable label, e.g. "Jun '26". */
  label: string;
  /** Sum of revenue for jobs whose committedDate (installDate) is this month. */
  holdRevenue: number;
  /**
   * Sum of revenue for jobs whose PROJECTED completion date is this month,
   * accounting for current buffer burn. Equal to holdRevenue when no slip.
   */
  slipRevenue: number;
  /** Count of jobs contributing to the hold side of this bucket. */
  holdJobs: number;
  /** Count of jobs contributing to the slip side of this bucket. */
  slipJobs: number;
};

/**
 * Per-job buffer-burn status for the buffer-burn view. Only populated for jobs
 * that have scheduling data (internalTargetDate set).
 */
export type JobForecastStatus = {
  jobId: string;
  jobName: string;
  /** The frozen client-committed install promise (jobs.install_date). */
  committedDate: string;
  /** The shop's internal target (jobs.internal_target_date). */
  internalTargetDate: string;
  /** Work days in the buffer pool (internalTargetDate → committedDate). */
  totalBufferDays: number;
  /**
   * Work days today has slid past internalTargetDate (= buffer consumed). 0 when
   * today is still before or on the internal target.
   */
  consumedBufferDays: number;
  /** Remaining buffer (totalBufferDays − consumedBufferDays). Negative = blown. */
  remainingBufferDays: number;
  /** Consumed as a % of the pool (0–100 normally, >100 when past committed date). */
  bufferConsumedPct: number;
  /** Billable value of this job (jobs.revenue). */
  revenue: number;
  /**
   * The projected completion date if current slippage continues:
   * addWorkDays(committedDate, consumedBufferDays). Null when no buffer consumed.
   */
  projectedDate: string | null;
  /**
   * YYYY-MM key of the month the revenue shifts INTO under the slip scenario.
   * Null when the projected date is in the same month as the committed date
   * (the slip stays within the same billing month).
   */
  slipsToKey: string | null;
};

/** Top-level result from computeRevenueForecast. */
export type RevenueForecastResult = {
  /** Per-month hold-vs-slip comparison, sorted ascending by calendar month. */
  buckets: ForecastBucket[];
  /**
   * Per-job buffer status for jobs that have scheduling data, sorted worst-first
   * (highest bufferConsumedPct first).
   */
  jobStatuses: JobForecastStatus[];
  /** Grand total: sum of all job revenues (hold and slip totals are equal). */
  totalRevenue: number;
  /** Revenue in jobs whose buffer has already started burning (consumedBufferDays > 0). */
  atRiskRevenue: number;
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Parse an ISO date to a { key, label } bucket descriptor. */
function monthOf(iso: string): { key: string; label: string } {
  // Anchor to noon to avoid timezone-rollover surprises on date-only strings.
  const d = new Date(iso + "T12:00:00");
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("en-CA", { month: "short", year: "2-digit" });
  return { key, label };
}

/**
 * Compute the buffer-burn status for a single job that has scheduling data.
 * Returns null when the job has no internalTargetDate (no scheduling set up yet).
 */
function computeJobStatus(job: Job, today: Date): JobForecastStatus | null {
  if (!job.internalTargetDate) return null;

  const committedDate = job.installDate;
  const internalTargetDate = job.internalTargetDate;
  const todayISO = today.toISOString().slice(0, 10);

  // Buffer pool = work days from the internal target to the committed date.
  const totalBufferDays = Math.max(0, workDaysBetween(internalTargetDate, committedDate));

  // Buffer consumed = how many work days today is past the internal target.
  // Capped at 0 from below (negative means we're still ahead of schedule).
  const rawConsumed = workDaysBetween(internalTargetDate, todayISO);
  const consumedBufferDays = Math.max(0, rawConsumed);

  const remainingBufferDays = totalBufferDays - consumedBufferDays;

  const bufferConsumedPct =
    totalBufferDays > 0
      ? (consumedBufferDays / totalBufferDays) * 100
      : consumedBufferDays > 0
        ? 100
        : 0;

  // Projected completion: if current slippage continues, the committed date
  // shifts forward by the same number of work days already consumed.
  const projectedDate =
    consumedBufferDays > 0 ? addWorkDays(committedDate, consumedBufferDays) : null;

  const committedKey = monthOf(committedDate).key;
  const projectedKey = projectedDate ? monthOf(projectedDate).key : null;

  // Only flag a slip when the revenue actually crosses a month boundary.
  const slipsToKey = projectedKey && projectedKey !== committedKey ? projectedKey : null;

  return {
    jobId: job.id,
    jobName: job.name,
    committedDate,
    internalTargetDate,
    totalBufferDays,
    consumedBufferDays,
    remainingBufferDays,
    bufferConsumedPct,
    revenue: job.revenue,
    projectedDate,
    slipsToKey,
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the two-scenario revenue forecast from the job list.
 *
 * @param jobs  All jobs (or the subset you care about).
 * @param today The reference date for buffer-burn computation (pass `new Date()`
 *              from the call site, or a fixed date in unit tests).
 */
export function computeRevenueForecast(jobs: Job[], today: Date): RevenueForecastResult {
  // Separate hold and slip buckets so jobs can land in different months on each side.
  const holdMap = new Map<string, ForecastBucket>();
  const slipMap = new Map<string, ForecastBucket>();

  const jobStatuses: JobForecastStatus[] = [];
  let totalRevenue = 0;
  let atRiskRevenue = 0;

  const ensureBucket = (map: Map<string, ForecastBucket>, key: string, label: string) => {
    if (!map.has(key)) {
      map.set(key, { key, label, holdRevenue: 0, slipRevenue: 0, holdJobs: 0, slipJobs: 0 });
    }
    return map.get(key)!;
  };

  for (const job of jobs) {
    const { key: holdKey, label: holdLabel } = monthOf(job.installDate);
    const status = computeJobStatus(job, today);

    totalRevenue += job.revenue;

    if (status) {
      jobStatuses.push(status);
      if (status.consumedBufferDays > 0) {
        atRiskRevenue += job.revenue;
      }
    }

    // Hold side: always bucket by the committed installDate.
    const holdBucket = ensureBucket(holdMap, holdKey, holdLabel);
    holdBucket.holdRevenue += job.revenue;
    holdBucket.holdJobs += 1;

    // Slip side: bucket by the projected date when slipping, otherwise same month.
    const slipKey = status?.slipsToKey ?? holdKey;
    const slipLabel =
      status?.slipsToKey && status.projectedDate
        ? monthOf(status.projectedDate).label
        : holdLabel;
    const slipBucket = ensureBucket(slipMap, slipKey, slipLabel);
    slipBucket.slipRevenue += job.revenue;
    slipBucket.slipJobs += 1;
  }

  // Merge hold and slip maps into unified ForecastBuckets.
  const allKeys = Array.from(new Set([...Array.from(holdMap.keys()), ...Array.from(slipMap.keys())]));
  const buckets: ForecastBucket[] = [];

  for (const key of allKeys) {
    const hold = holdMap.get(key);
    const slip = slipMap.get(key);
    buckets.push({
      key,
      label: hold?.label ?? slip?.label ?? key,
      holdRevenue: hold?.holdRevenue ?? 0,
      slipRevenue: slip?.slipRevenue ?? 0,
      holdJobs: hold?.holdJobs ?? 0,
      slipJobs: slip?.slipJobs ?? 0,
    });
  }

  buckets.sort((a, b) => a.key.localeCompare(b.key));

  // Sort jobs worst-first for the buffer-burn list.
  jobStatuses.sort((a, b) => b.bufferConsumedPct - a.bufferConsumedPct);

  return { buckets, jobStatuses, totalRevenue, atRiskRevenue };
}
