/**
 * Pure, I/O-free helpers for QBO S9 — push audit log + retry queue
 * (issue #155). No Supabase, no QBO API, no React.
 *
 * Server I/O (writing rows, reading the queue) lives in `qboPushAuditServer.ts`.
 *
 * Responsibilities:
 *  • Typed status lifecycle for `qbo_push_attempts` rows.
 *  • Exponential-backoff calculation for the retry queue (honours QBO's
 *    ~500/min rate limit by starting at 30 s and doubling, capped at 4 h).
 *  • HTTP-status classification: transient (429/5xx → retry) vs permanent
 *    (4xx except 429 → alert, no auto-retry).
 */

// ── Status lifecycle ──────────────────────────────────────────────────────────

/**
 * Lifecycle states for a `qbo_push_attempts` row:
 *
 *  queued           → first attempt is pending execution (or a retry just started)
 *  succeeded        → bill created (or adopted) in QBO; no further action
 *  failed_transient → 429/5xx; next_retry_at is set; auto-retry will re-attempt
 *  failed_permanent → 4xx (not 429) or exhausted retries; alert required
 *  retried          → superseded by a later attempt; kept for audit history only
 */
export type PushAttemptStatus =
  "queued" | "succeeded" | "failed_transient" | "failed_permanent" | "retried";

/** Minimal row shape for retry scheduling logic (mirrors the DB table). */
export type PushAttemptRow = {
  id: string;
  invoiceId: string;
  status: PushAttemptStatus;
  retryCount: number;
  nextRetryAt: string | null;
  pushedBy: string | null;
  realmId: string | null;
  environment: string | null;
  createdAt: string;
};

/**
 * The single most-recent push attempt for an invoice, distilled to what the
 * push panel needs to surface failed / retry-pending outcomes (QBO-H7, #190).
 * Connection-independent: read from the audit table with the service role, so
 * a prior failure stays visible even when the QBO token is currently
 * unconfigured or disconnected.
 */
export type LatestPushAttempt = {
  status: PushAttemptStatus;
  nextRetryAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

// ── Exponential backoff ───────────────────────────────────────────────────────

/**
 * Milliseconds to wait before the N-th retry attempt.
 *
 * Base 30 s, doubling each time, capped at 4 h. This keeps the queue
 * within QBO's stated 500-calls/min limit even when many invoices fail at
 * once: the staggered backoff naturally spreads retries over time.
 *
 * @param retryCount  The number of attempts that have already been made
 *                    (0 = computing the delay before the FIRST retry).
 * @param baseMs      Override the base delay (default 30 000 ms). Useful
 *                    for tests.
 */
export function nextRetryDelayMs(retryCount: number, baseMs = 30_000): number {
  const cap = 4 * 60 * 60 * 1000; // 4 hours
  return Math.min(baseMs * Math.pow(2, retryCount), cap);
}

/**
 * ISO-8601 timestamp for when the next retry should be attempted.
 *
 * @param retryCount  Attempts already made (0 = first retry window).
 * @param now         The current moment (injectable for tests).
 * @param baseMs      Override the base delay.
 */
export function nextRetryAt(retryCount: number, now: Date = new Date(), baseMs?: number): string {
  return new Date(now.getTime() + nextRetryDelayMs(retryCount, baseMs)).toISOString();
}

// ── HTTP-status classification ────────────────────────────────────────────────

/**
 * True for HTTP statuses where a push failed *transiently* — retrying with
 * backoff may succeed:
 *   • 429 Rate limited  — QBO enforces ~500/min per realm.
 *   • 500 Internal error — QBO-side glitch; often clears on retry.
 *   • 502 Bad gateway   — network/proxy between us and QBO.
 *   • 503 Unavailable   — QBO maintenance window.
 */
export function isTransientHttpStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus === 500 || httpStatus === 502 || httpStatus === 503;
}

/**
 * True for HTTP statuses where the push failed *permanently* — the request
 * body is invalid or unauthorised; auto-retry would loop forever.
 * Defined as: 4xx EXCEPT 429 (which is transient / rate-limited).
 */
export function isPermanentHttpStatus(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429;
}
