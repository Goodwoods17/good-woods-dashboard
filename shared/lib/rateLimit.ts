/**
 * A tiny fixed-window in-memory rate limiter for no-login WRITE routes (S11
 * designer upload portal, ADR 0022). A leaked write-token is the worst case, so
 * the route caps how often a single key (token / IP) may POST within a window.
 *
 * In-memory + per-instance (serverless may run several), so it is a best-effort
 * throttle layered ON TOP of the per-token count/byte quota (which IS durable in
 * the DB) — never the only defence. Pure-ish: the clock + store are injectable so
 * it unit-tests deterministically.
 */

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number };

export type RateLimiter = {
  check: (key: string) => RateLimitResult;
};

type Window = { count: number; resetAt: number };

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
  store?: Map<string, Window>;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const store = opts.store ?? new Map<string, Window>();

  return {
    check(key: string): RateLimitResult {
      const t = now();
      const w = store.get(key);
      if (!w || t >= w.resetAt) {
        store.set(key, { count: 1, resetAt: t + opts.windowMs });
        return { allowed: true, remaining: opts.limit - 1, retryAfterMs: 0 };
      }
      if (w.count >= opts.limit) {
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, w.resetAt - t) };
      }
      w.count += 1;
      return { allowed: true, remaining: opts.limit - w.count, retryAfterMs: 0 };
    },
  };
}
