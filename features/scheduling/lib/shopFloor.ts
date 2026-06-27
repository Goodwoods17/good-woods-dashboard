/**
 * S10 — Shop-floor phase targets + daily goals + advisory EDD/bottleneck flags
 * (issue #98). Pure + dependency-free so it unit-tests without React/Supabase.
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * The three responsibilities:
 *  1. `phaseTargetLabel` — human-readable "by Mon · 3d left · on pace" badge
 *     for each phase column header in the job status view.
 *  2. `phaseTargetPaceStatus` — derived pace (on_pace / due_today / behind)
 *     used to colour the badge and drive daily-goal highlighting.
 *  3. `phaseBottleneckAdvisory` — advisory message for the board when a phase
 *     is behind, explaining the downstream consequence. Never blocks the crew.
 */

/** Whether this phase is ahead of its target, right on it, or overdue. */
export type PaceStatus = "on_pace" | "due_today" | "behind";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Target date as a UTC-anchored midnight, so comparisons are TZ-independent. */
function utcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Today's date expressed as a UTC midnight (strips the time component). */
function todayUTC(today: Date): Date {
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ── 1. Days until ──────────────────────────────────────────────────────────

/**
 * Full calendar days between `today` and the target.
 * 0 = same day, positive = target is in the future, negative = target passed.
 * UTC-anchored so the result is timezone-independent — a date is a date.
 */
export function daysUntil(targetDate: string, today: Date): number {
  const target = utcMidnight(targetDate).getTime();
  const base = todayUTC(today).getTime();
  const diffMs = target - base;
  // Divide by ms-per-day and round, handling floating-point edge cases.
  return Math.round(diffMs / (24 * 3_600_000));
}

// ── 2. Pace status ─────────────────────────────────────────────────────────

/**
 * Is this phase ahead of its target (on_pace), right on it (due_today), or
 * past it (behind)?
 */
export function phaseTargetPaceStatus(targetDate: string, today: Date): PaceStatus {
  const days = daysUntil(targetDate, today);
  if (days < 0) return "behind";
  if (days === 0) return "due_today";
  return "on_pace";
}

// ── 3. Human-readable label ────────────────────────────────────────────────

/**
 * Compact header badge for the phase column:
 *   "by Mon · 3d left · on pace"   (future)
 *   "due today · on pace"           (same day)
 *   "by Mon · 2d overdue · behind"  (past)
 *
 * Designed to fit in a narrow phase-section header without truncation.
 */
export function phaseTargetLabel(targetDate: string, today: Date): string {
  const days = daysUntil(targetDate, today);
  const targetDay = utcMidnight(targetDate).getUTCDay();
  const weekday = SHORT_WEEKDAYS[targetDay];

  if (days === 0) {
    return "due today · on pace";
  }
  if (days > 0) {
    const dayCount = days === 1 ? "1d left" : `${days}d left`;
    return `by ${weekday} · ${dayCount} · on pace`;
  }
  // Overdue
  const overdueDays = Math.abs(days);
  const overdueCount = overdueDays === 1 ? "1d overdue" : `${overdueDays}d overdue`;
  return `by ${weekday} · ${overdueCount} · behind`;
}

// ── 4. Advisory bottleneck message ────────────────────────────────────────

/**
 * Returns an advisory message when a job's phase is behind schedule, explaining
 * the downstream consequence (WIP pileup). Returns null for on-pace / due-today
 * phases — no need to surface a non-problem.
 *
 * The message is purely advisory and never blocks the crew from making any
 * changes to the board.
 */
export function phaseBottleneckAdvisory(
  jobName: string,
  phaseName: string,
  pace: PaceStatus
): string | null {
  if (pace !== "behind") return null;
  return (
    `${jobName}'s ${phaseName} phase is behind — address it first to unblock ` +
    `downstream phases and avoid WIP pileup.`
  );
}
