import { MILESTONE_STAGES, type MilestoneStage } from "@shared/lib/types";

/**
 * S5 — Editable Gantt schedule: ripple/pull-plan/conflict logic (issue #93).
 * Pure + dependency-free so it unit-tests without React/Supabase.
 * Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod).
 *
 * Three core operations:
 *   1. `addWorkDays` / `workDaysBetween` — work-day calendar arithmetic
 *      (shared helpers so the rest of the file stays readable).
 *   2. `rippleForward` — when the user drags a phase bar, cascade the
 *      same delta to all downstream phases; halt at pinned anchors (warn).
 *   3. `pullPlanBackward` — when Install (or any anchor) is pinned, compute
 *      all preceding phase dates backward from the anchor using stored phase
 *      durations; warn if any pinned intermediate conflicts.
 */

export const PHASES: readonly MilestoneStage[] = MILESTONE_STAGES.map((s) => s.key);

// ── Types ──────────────────────────────────────────────────────────────────

/** Set of phase keys that are pinned as hard anchors in the current session. */
export type PinnedPhases = Set<MilestoneStage>;

export type ConflictWarning = {
  phase: MilestoneStage;
  type: "pinned_anchor_violated";
  message: string;
};

export type RippleResult = {
  /** Updated (or unchanged) phase target dates. Preserves all existing keys. */
  dates: Partial<Record<MilestoneStage, string>>;
  /** Non-empty when a pinned anchor was in the ripple path. */
  conflicts: ConflictWarning[];
};

// ── Calendar helpers ───────────────────────────────────────────────────────

/** ISO YYYY-MM-DD of a UTC-anchored Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse an ISO YYYY-MM-DD string to a midnight-UTC Date. */
function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Add `n` work days (Mon–Fri, UTC) to an ISO date string. Negative `n` moves
 * backward. Zero returns the same string unchanged.
 */
export function addWorkDays(date: string, n: number): string {
  if (n === 0) return date;
  const d = parseDate(date);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return isoDate(d);
}

/**
 * Count work days (Mon–Fri) from `from` to `to`, exclusive of `from` and
 * inclusive of `to`. Returns negative when `to` is before `from`, zero when
 * equal.
 *
 * This is the inverse of `addWorkDays`:
 *   addWorkDays(from, workDaysBetween(from, to)) === to
 * (when both dates are weekdays — weekend dates are accepted but treated as
 * the date value supplied, without snapping).
 */
export function workDaysBetween(from: string, to: string): number {
  if (from === to) return 0;
  const fromMs = parseDate(from).getTime();
  const toMs = parseDate(to).getTime();
  const forward = toMs > fromMs;
  const a = forward ? from : to;
  const b = forward ? to : from;
  // Walk from a toward b, counting weekdays (start excluded, end included).
  let count = 0;
  const d = parseDate(a);
  while (isoDate(d) !== b) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return forward ? count : -count;
}

// ── 1. Ripple forward ──────────────────────────────────────────────────────

/**
 * Ripple a phase date change forward through the 6-phase chain.
 *
 * When `changedPhase` is moved to `newDate`, the delta in work days relative
 * to the old date is computed and applied to every DOWNSTREAM phase. Phases
 * with no date in `phaseTargetDates` are skipped. Phases UPSTREAM of
 * `changedPhase` are not touched.
 *
 * **Pinned anchors:** a pinned phase cannot shift. If the ripple delta would
 * move a pinned phase, a `ConflictWarning` is emitted and that phase's date
 * is left unchanged. The ripple continues past it — non-pinned phases further
 * downstream still receive the full delta (so the gap between the pinned anchor
 * and the next phase may shrink or grow, which is the expected warning signal).
 *
 * Returns `{ dates, conflicts }`. `dates` is a shallow copy of
 * `phaseTargetDates` with updated values; the input is never mutated.
 */
export function rippleForward(
  phaseTargetDates: Partial<Record<MilestoneStage, string>>,
  changedPhase: MilestoneStage,
  newDate: string,
  pinnedPhases: PinnedPhases
): RippleResult {
  const oldDate = phaseTargetDates[changedPhase];
  const delta = oldDate ? workDaysBetween(oldDate, newDate) : 0;

  const dates: Partial<Record<MilestoneStage, string>> = {
    ...phaseTargetDates,
    [changedPhase]: newDate,
  };
  const conflicts: ConflictWarning[] = [];

  if (delta === 0) return { dates, conflicts };

  const changedIdx = PHASES.indexOf(changedPhase);
  for (let i = changedIdx + 1; i < PHASES.length; i++) {
    const phase = PHASES[i];
    const currentDate = dates[phase];
    if (!currentDate) continue; // no date set for this phase → skip

    if (pinnedPhases.has(phase)) {
      conflicts.push({
        phase,
        type: "pinned_anchor_violated",
        message: `Ripple would move ${MILESTONE_STAGES.find((s) => s.key === phase)?.label ?? phase} by ${delta > 0 ? "+" : ""}${delta}d — it is a pinned anchor and cannot shift.`,
      });
      // Phase stays at its current date. Ripple continues past it with the
      // same delta so the user can see all downstream effects.
      continue;
    }
    dates[phase] = addWorkDays(currentDate, delta);
  }

  return { dates, conflicts };
}

// ── 2. Pull-plan backward ──────────────────────────────────────────────────

/**
 * Pull-plan backward from a pinned anchor phase.
 *
 * Given a fixed `anchorDate` for `anchorPhase`, each PRECEDING phase's target
 * date is computed by walking backward through the chain and subtracting each
 * phase's duration in work days. Phases AFTER the anchor are copied unchanged
 * from `currentDates`.
 *
 * The relationship is: each phase's end = successor's end − successor's duration.
 * So `delivery_end = install_end − phaseDurations[install]`, and so on.
 *
 * **Pinned intermediates:** if a preceding phase is also pinned and its pinned
 * date differs from the computed date, a `ConflictWarning` is emitted and the
 * pinned date is preserved and used as the cursor for further backward
 * planning. When the dates match, no conflict is raised.
 *
 * Returns `{ dates, conflicts }`. `currentDates` is never mutated.
 */
export function pullPlanBackward(
  anchorPhase: MilestoneStage,
  anchorDate: string,
  phaseDurations: Record<MilestoneStage, number>,
  currentDates: Partial<Record<MilestoneStage, string>>,
  pinnedPhases: PinnedPhases
): RippleResult {
  const anchorIdx = PHASES.indexOf(anchorPhase);
  const dates: Partial<Record<MilestoneStage, string>> = {
    ...currentDates,
    [anchorPhase]: anchorDate,
  };
  const conflicts: ConflictWarning[] = [];

  // Walk backward from the phase immediately before the anchor.
  // predecessor_end = successor_end − successor_duration.
  let cursor = anchorDate;
  for (let i = anchorIdx; i >= 1; i--) {
    const successorPhase = PHASES[i];
    const predecessorPhase = PHASES[i - 1];
    const duration = Math.max(0, phaseDurations[successorPhase] ?? 0);
    const computed = addWorkDays(cursor, -duration);

    if (pinnedPhases.has(predecessorPhase)) {
      const pinned = currentDates[predecessorPhase];
      if (pinned && pinned !== computed) {
        conflicts.push({
          phase: predecessorPhase,
          type: "pinned_anchor_violated",
          message: `Pull-plan would move ${MILESTONE_STAGES.find((s) => s.key === predecessorPhase)?.label ?? predecessorPhase} to ${computed} — it is pinned at ${pinned} and cannot shift.`,
        });
        // Use the pinned date as the new cursor so further backward phases
        // are planned from the hard constraint, not the inconsistent computed date.
        cursor = pinned;
        dates[predecessorPhase] = pinned;
      } else {
        // Pinned date matches computed (or no existing pinned date) → no conflict.
        cursor = pinned ?? computed;
        dates[predecessorPhase] = cursor;
      }
    } else {
      dates[predecessorPhase] = computed;
      cursor = computed;
    }
  }

  return { dates, conflicts };
}
