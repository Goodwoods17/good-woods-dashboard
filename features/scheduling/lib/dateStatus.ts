/**
 * The one date-vs-today comparison the scheduling derivations share.
 *
 * Three "is it on track?" badges across scheduling each re-rolled the same
 * question — "is this target day before, on, or after today?" — with different
 * end-of-day handling (a `T23:59:59.999Z` instant compare, a `daysUntil`
 * rounding, an ISO-string `<`). They are the SAME primitive at UTC **day**
 * granularity, unified here so the boundary rule lives in one place.
 *
 * Pure + dependency-free. Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED.
 */

/**
 * Compare a target date to 'today' at UTC DAY granularity.
 *   - `due`   when the target day is the same calendar day as today.
 *   - `past`  once the target day is fully behind today (target day < today day).
 *   - `ahead` when the target day is still in the future (target day > today day).
 *
 * Both inputs are normalized to a UTC calendar day (date-only): a date is a
 * date, not an instant, so the result is timezone-independent. `today` accepts
 * a `Date` (callers holding an instant) or an ISO string (callers holding a
 * `YYYY-MM-DD`), so each caller passes exactly what it already has.
 */
export function compareToTarget(targetIso: string, today: Date | string): "ahead" | "due" | "past" {
  const targetDay = utcDayIndex(targetIso);
  const todayDay = utcDayIndex(today);
  if (targetDay > todayDay) return "ahead";
  if (targetDay < todayDay) return "past";
  return "due";
}

/** The UTC calendar day of a Date or ISO string, as a comparable timestamp. */
function utcDayIndex(value: Date | string): number {
  const date = typeof value === "string" ? parseToUtcDate(value) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Parse an ISO string to a Date. A date-only `YYYY-MM-DD` is pinned to UTC
 * midnight (so it's timezone-independent — matching the existing helpers); a
 * full timestamp is parsed as-is (only its UTC calendar day is then read).
 */
function parseToUtcDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
}
