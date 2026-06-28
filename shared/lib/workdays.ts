/**
 * The shop **work calendar** — the single source of truth for what a *work day*
 * is (see docs/domain.md → "Work calendar" / "Work day" / "BC statutory
 * holiday"). All schedule arithmetic in the Scheduling & Client-Commitment
 * Engine counts in **work days**, not calendar days: Mon–Fri, minus the 11 BC
 * statutory holidays, minus any shop-specific closures supplied via
 * `extraClosures`.
 *
 * Deepened out of five private copies of the "skip weekends" rule during the
 * 2026-06-27 architecture review. The deliberate correctness gain over those
 * copies: this calendar also skips **BC statutory holidays**, so any date that
 * chains across a holiday lands one work day later than a naive Mon–Fri walk.
 *
 * **Contract — a date is a date, never an instant.** Every function takes and
 * returns ISO `YYYY-MM-DD` strings, parsed and formatted strictly in UTC
 * (`new Date(\`${iso}T00:00:00.000Z\`)` in, `.toISOString().slice(0, 10)` out).
 * No `Date` object ever escapes this module, so callers can't accidentally drag
 * a local-timezone instant through the math. Inputs are normalized to their
 * first 10 characters, so an ISO timestamp is accepted as its date part.
 */

export type Iso = string; // 'YYYY-MM-DD'

export interface WorkCalendarOpts {
  /** Shop-specific closures (Boxing Day, a summer shutdown week, …) layered on
   * top of weekends + stat holidays without touching call sites. */
  extraClosures?: ReadonlySet<Iso>;
}

// ── ISO/UTC primitives ───────────────────────────────────────────────────────

/** Normalize any ISO-ish string to its `YYYY-MM-DD` date part. */
function normalize(iso: Iso): Iso {
  return iso.slice(0, 10);
}

/** Parse a `YYYY-MM-DD` string to a midnight-UTC Date (internal use only). */
function parse(iso: Iso): Date {
  return new Date(`${normalize(iso)}T00:00:00.000Z`);
}

/** Format a UTC-anchored Date back to `YYYY-MM-DD` (internal use only). */
function format(d: Date): Iso {
  return d.toISOString().slice(0, 10);
}

/** Build a `YYYY-MM-DD` string from UTC year/month0/day. */
function isoOf(year: number, month0: number, day: number): Iso {
  return format(new Date(Date.UTC(year, month0, day)));
}

// ── BC statutory holidays ─────────────────────────────────────────────────────

/** Memoized per-year holiday sets so repeated walks stay cheap. */
const holidayCache = new Map<number, Set<Iso>>();

/**
 * Nth weekday of a month, e.g. the 3rd Monday of February.
 * `weekday`: 0 = Sunday … 1 = Monday … 6 = Saturday. `n` is 1-based.
 */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Iso {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  return isoOf(year, month0, 1 + offset + (n - 1) * 7);
}

/** The Monday on-or-before a given month/day (used for Victoria Day). */
function mondayOnOrBefore(year: number, month0: number, day: number): Iso {
  const dow = new Date(Date.UTC(year, month0, day)).getUTCDay();
  const back = (dow - 1 + 7) % 7; // 1 = Mon → 0 back
  return isoOf(year, month0, day - back);
}

/**
 * Easter Sunday for `year` via the Anonymous Gregorian algorithm (Computus).
 * Returns `[month0, day]`.
 */
function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

/**
 * Shift a fixed-date holiday onto its observed day: a holiday landing on
 * Saturday or Sunday is observed the following Monday (the observed date is the
 * non-working day). Nth-Monday and Good Friday holidays never hit a weekend, so
 * this is only applied to the fixed-date ones.
 */
function observed(iso: Iso): Iso {
  const d = parse(iso);
  const dow = d.getUTCDay();
  if (dow === 6)
    d.setUTCDate(d.getUTCDate() + 2); // Sat → Mon
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sun → Mon
  return format(d);
}

/**
 * The 11 BC statutory holidays for `year`, as ISO dates — computed, never a
 * hardcoded table, so it is correct for any year. Fixed-date holidays carry the
 * Sat/Sun → Monday observed shift; weekday-anchored ones do not need it.
 * Memoized per year.
 */
export function bcStatHolidays(year: number): Set<Iso> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const [easterMonth0, easterDay] = easterSunday(year);
  const goodFriday = format(new Date(Date.UTC(year, easterMonth0, easterDay - 2)));

  const holidays = new Set<Iso>([
    // Fixed-date (observed-shifted if on a weekend).
    observed(isoOf(year, 0, 1)), //  New Year's Day — Jan 1
    observed(isoOf(year, 6, 1)), //  Canada Day — Jul 1
    observed(isoOf(year, 8, 30)), // Truth & Reconciliation — Sep 30
    observed(isoOf(year, 10, 11)), // Remembrance Day — Nov 11
    observed(isoOf(year, 11, 25)), // Christmas Day — Dec 25
    // Weekday-anchored (never land on a weekend).
    nthWeekdayOfMonth(year, 1, 1, 3), //  Family Day — 3rd Mon Feb
    mondayOnOrBefore(year, 4, 24), //     Victoria Day — Mon on-or-before May 24
    nthWeekdayOfMonth(year, 7, 1, 1), //  BC Day — 1st Mon Aug
    nthWeekdayOfMonth(year, 8, 1, 1), //  Labour Day — 1st Mon Sep
    nthWeekdayOfMonth(year, 9, 1, 2), //  Thanksgiving — 2nd Mon Oct
    // Easter-based.
    goodFriday, // Good Friday — Easter Sunday − 2 days
  ]);

  holidayCache.set(year, holidays);
  return holidays;
}

// ── Work-day predicate ────────────────────────────────────────────────────────

/**
 * Whether `iso` is a day the shop works: not Saturday/Sunday (UTC), not a BC
 * statutory holiday for that date's year, and not in `opts.extraClosures`.
 */
export function isWorkDay(iso: Iso, opts?: WorkCalendarOpts): boolean {
  const norm = normalize(iso);
  const d = parse(norm);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (bcStatHolidays(d.getUTCFullYear()).has(norm)) return false;
  if (opts?.extraClosures?.has(norm)) return false;
  return true;
}

// ── Work-day arithmetic ───────────────────────────────────────────────────────

/**
 * Add `n` work days to `iso`. Signed: positive moves forward, negative moves
 * backward, `n === 0` returns `iso` unchanged (normalized). Steps one calendar
 * day at a time, decrementing the remaining count only when the landed day is a
 * work day — so weekends and BC stat holidays are skipped in both directions.
 * (The earlier Date-based copies silently ignored negative `n`; this does not.)
 */
export function addWorkDays(iso: Iso, n: number, opts?: WorkCalendarOpts): Iso {
  if (n === 0) return normalize(iso);
  const d = parse(iso);
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkDay(format(d), opts)) remaining -= 1;
  }
  return format(d);
}

/**
 * Signed count of work days from `from` to `to`, **from-EXCLUDED, to-INCLUDED**,
 * 0 when equal. Positive when `to` is after `from`, negative when before. The
 * inverse of `addWorkDays`: `addWorkDays(from, workDaysBetween(from, to)) === to`
 * whenever `to` is itself a work day.
 */
export function workDaysBetween(from: Iso, to: Iso, opts?: WorkCalendarOpts): number {
  const a0 = normalize(from);
  const b0 = normalize(to);
  if (a0 === b0) return 0;
  const forward = parse(b0).getTime() > parse(a0).getTime();
  const start = forward ? a0 : b0;
  const end = forward ? b0 : a0;
  let count = 0;
  const d = parse(start);
  while (format(d) !== end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkDay(format(d), opts)) count += 1;
  }
  return forward ? count : -count;
}

// ── Work-week bucketing (holiday-agnostic — a week is a week) ──────────────────

/**
 * The Monday (UTC) of the ISO week containing `iso`. If `iso` is already a
 * Monday it is returned unchanged. Holiday-agnostic.
 */
export function weekMondayOf(iso: Iso): Iso {
  const d = parse(iso);
  const toMonday = (d.getUTCDay() + 6) % 7; // days back to Monday
  d.setUTCDate(d.getUTCDate() - toMonday);
  return format(d);
}

/**
 * The Mon–Fri work-week window containing `iso`: `{ start, end }` where `start`
 * is `weekMondayOf(iso)` and `end` is the Friday (Monday + 4 calendar days).
 * Holiday-agnostic — used to present a phase as a soft RANGE.
 */
export function businessWeekWindow(iso: Iso): { start: Iso; end: Iso } {
  const start = weekMondayOf(iso);
  const friday = parse(start);
  friday.setUTCDate(friday.getUTCDate() + 4);
  return { start, end: format(friday) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Human-readable label for a week, e.g. "Week of Aug 4". Input must be the
 * Monday ISO date of the week.
 */
export function weekLabel(weekStart: Iso): string {
  const d = parse(weekStart);
  return `Week of ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
