/**
 * Per-file size + per-token quota gate for the no-login designer UPLOAD portal
 * (S11, ADR 0022 · milestone #12). A no-login WRITE capability is the highest-
 * risk surface in the app: an attacker with a leaked token could otherwise fill
 * Storage. Three independent ceilings, all enforced server-side on the RECEIVED
 * bytes (never a client-claimed size):
 *   • per-file byte limit       — one upload can't be huge,
 *   • per-token upload COUNT     — a token can't be used to drop unlimited files,
 *   • per-token TOTAL byte cap   — the sum across a token's uploads is bounded.
 *
 * Pure (no I/O) so it unit-tests exhaustively; the route supplies the live usage
 * read from the token row's `state`.
 */

/** 25 MiB — comfortably fits a large drawing PDF or a phone photo. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** A single document-request link accepts at most this many files. */
export const MAX_UPLOADS_PER_TOKEN = 20;

/** And at most this many total bytes across all of its uploads (150 MiB). */
export const MAX_TOTAL_BYTES_PER_TOKEN = 150 * 1024 * 1024;

/** What a token has already consumed (read from `share_tokens.state`). */
export type UploadUsage = {
  count: number;
  totalBytes: number;
};

export type UploadCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "empty" | "too_large" | "count_quota" | "total_quota";
      /** The HTTP status the route should return for this rejection. */
      status: 400 | 413 | 429;
      message: string;
    };

/**
 * Decide whether a file of `size` received bytes may be accepted given the
 * token's prior `usage`. Order matters: a malformed/empty file is a 400, an
 * over-limit file is a 413, an exhausted count is a 429, an over-cap total is a
 * 413. The size is validated as a finite, positive integer first — a NaN /
 * negative is treated as empty (the route never trusts the number).
 */
export function checkUploadAllowed(size: number, usage: UploadUsage): UploadCheckResult {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: "empty", status: 400, message: "Empty or invalid file." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      status: 413,
      message: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
    };
  }
  if (usage.count >= MAX_UPLOADS_PER_TOKEN) {
    return {
      ok: false,
      reason: "count_quota",
      status: 429,
      message: "This link has reached its upload limit.",
    };
  }
  if (usage.totalBytes + size > MAX_TOTAL_BYTES_PER_TOKEN) {
    return {
      ok: false,
      reason: "total_quota",
      status: 413,
      message: "This link has reached its total storage limit.",
    };
  }
  return { ok: true };
}
