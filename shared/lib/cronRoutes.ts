/**
 * Machine-to-machine API routes that authenticate via a `CRON_SECRET` bearer
 * token rather than a logged-in browser session (QBO-H11).
 *
 * The auth middleware redirects any un-authenticated request to `/login`. For an
 * external cron / home-machine caller that legitimately carries a CRON_SECRET
 * Bearer (no session cookie), that redirect means the request "silently hits the
 * login page" — the drain/export never runs and nothing surfaces the failure.
 *
 * These routes enforce CRON_SECRET themselves (and 404 when their feature flag
 * is off), so letting them past the session gate leaks nothing — it just lets
 * the handler's own auth do its job. Keep this list TIGHT: only true cron/M2M
 * endpoints belong here.
 */

/** The exact cron/M2M paths (or path patterns) exempt from the session gate. */
export function isCronExemptPath(path: string): boolean {
  // QBO retry-queue drain — POSTed by an external cron with the bearer token.
  if (path === "/api/invoices/qbo/retry-queue") return true;
  // Per-invoice QBO export — GET /api/invoices/<id>/export-qbo (sync layer).
  if (/^\/api\/invoices\/[^/]+\/export-qbo$/.test(path)) return true;
  return false;
}
