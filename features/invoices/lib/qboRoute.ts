/**
 * Shared QBO API-route helpers (QBO-H10 consolidation, issue #193).
 *
 * The QBO route handlers repeated two pieces verbatim: the
 * `invoicesQboEnabled()` flag check that 404s when the sub-flag is off, and a
 * `statusForReason` switch mapping a typed failure reason to an HTTP status.
 * Centralizing both keeps every QBO route returning the SAME status for the same
 * reason (e.g. `unconfigured` → 503) and the same 404 shape when dark.
 *
 * Server-only (uses `next/server`); imported by the QBO route handlers.
 */
import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "./featureFlag";

/**
 * Map a typed QBO failure reason to its HTTP status. Shared across the QBO
 * routes so the contract can't drift: `unconfigured` (creds absent) → 503,
 * `not_connected` (no consent) → 400, `not_found` → 404, `qbo_error` (upstream
 * Intuit failure) → 502, anything else → 400.
 */
export function statusForReason(reason: string): number {
  switch (reason) {
    case "unconfigured":
      return 503;
    case "not_connected":
      return 400;
    case "not_found":
      return 404;
    case "qbo_error":
      return 502;
    default:
      return 400;
  }
}

/**
 * Guard a QBO route on the `NEXT_PUBLIC_INVOICES_QBO_ENABLED` sub-flag. Returns
 * the dark-ship 404 response when the flag is off, or `null` to proceed:
 *
 *   const off = requireQboEnabled();
 *   if (off) return off;
 */
export function requireQboEnabled(): NextResponse | null {
  if (invoicesQboEnabled()) return null;
  return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
}
