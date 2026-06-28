/**
 * Pure, I/O-free helpers for QBO S11 — token-health assessment (issue #157).
 * No Supabase, no QBO API, no React.
 *
 * QBO refresh tokens expire after 100 days of inactivity.  Each successful
 * `getFreshAccessToken()` call in qboConnectionServer rotates the refresh
 * token and updates `updated_at`, resetting the 100-day clock.  So the age
 * of the active refresh token ≈ now − updated_at (the last successful refresh).
 *
 * Thresholds (conservative):
 *   ok       < 80 days — healthy, no action needed
 *   warning  80–94 days — connection is aging; prompt to reconnect soon
 *   critical ≥ 95 days — nearing the 100-day limit; reconnect NOW
 *
 * When `lastActivityAt` is null (no connection row, or updated_at absent)
 * the level is `critical` — worst-case assumption is safest.
 */

export type TokenHealthLevel = "ok" | "warning" | "critical";

export type TokenHealth = {
  level: TokenHealthLevel;
  /** How many days old the token activity is (null when no activity date is known). */
  daysOld: number | null;
  /** Plain-English description for the UI. */
  message: string;
};

/** Days-old thresholds (immutable, exported for tests). */
export const TOKEN_WARNING_DAYS = 80;
export const TOKEN_CRITICAL_DAYS = 95;

/**
 * Assess the health of the QBO refresh token from the timestamp of the
 * last successful token-refresh (the `updated_at` of the connection row).
 *
 * @param lastActivityAt  The `updated_at` (or `connected_at`) of the
 *                        quickbooks_connection row.  Pass null when unknown.
 * @param now             The current moment (injectable for tests).
 */
export function assessTokenHealth(
  lastActivityAt: Date | null,
  now: Date = new Date()
): TokenHealth {
  if (!lastActivityAt) {
    return {
      level: "critical",
      daysOld: null,
      message: "QuickBooks token health is unknown — reconnect to be sure.",
    };
  }

  const msOld = now.getTime() - lastActivityAt.getTime();
  const daysOld = Math.floor(msOld / (1000 * 60 * 60 * 24));

  if (daysOld >= TOKEN_CRITICAL_DAYS) {
    return {
      level: "critical",
      daysOld,
      message: `QuickBooks token is ${daysOld} days old — reconnect now before it expires.`,
    };
  }

  if (daysOld >= TOKEN_WARNING_DAYS) {
    return {
      level: "warning",
      daysOld,
      message: `QuickBooks token is ${daysOld} days old — consider reconnecting soon (expires at 100 days).`,
    };
  }

  return {
    level: "ok",
    daysOld,
    message: `QuickBooks connection is healthy (${daysOld} days old).`,
  };
}
