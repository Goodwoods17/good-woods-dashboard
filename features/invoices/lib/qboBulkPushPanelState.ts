/**
 * Pure, I/O-free state machine for the QBO bulk-push panel (QBO-H9, issue #192).
 * No React, no fetch — just response → next-state derivation, so the
 * "stop the silent vanish" behaviour is unit-testable without a DOM.
 *
 * The bug it fixes: the panel used to collapse ANY non-ok GET / thrown error
 * / `ok:false` POST to `phase:"hidden"` (or a silent reload), so a transient
 * 500 made the whole catch-up bar disappear — the owner couldn't tell
 * "no backlog" from "service broken". We now split:
 *
 *   - the genuine "no panel" statuses (flag off / not connected / unconfigured)
 *     still hide, because Settings owns that onboarding path; but
 *   - any other failure (5xx, network throw, 200 with ok:false, a POST that
 *     comes back !ok) surfaces a visible, RETRYABLE error row.
 */

import type { TokenHealth } from "./qboTokenHealth";
import type { BulkPushSummary } from "./qboBulkPush";

export type BulkPushState =
  | { phase: "loading" }
  | { phase: "hidden" } // QBO off / not connected — Settings handles onboarding
  | { phase: "idle"; count: number; tokenHealth: TokenHealth | null }
  | { phase: "pushing" }
  | { phase: "error"; message: string }
  | { phase: "done"; summary: BulkPushSummary; tokenHealth: TokenHealth | null };

/** Message shown when QuickBooks can't be reached on the initial probe. */
export const LOAD_ERROR_MESSAGE = "Couldn't reach QuickBooks — retry";

/**
 * HTTP statuses that legitimately mean "there is no panel to show": the flag
 * is off (404), or QBO isn't connected/configured (400/403/503). The standard
 * "Connect QuickBooks" panel in Settings drives that path, so we stay hidden
 * rather than nagging from the invoices list.
 */
const HIDDEN_STATUSES = new Set([400, 403, 404, 503]);

/** Shape of the GET /bulk-push response body we care about. */
export type LoadResponseBody = {
  ok: boolean;
  count?: number;
  tokenHealth?: TokenHealth | null;
} | null;

/** Derive the next state from a completed GET /bulk-push response. */
export function deriveLoadState(res: {
  status: number;
  ok: boolean;
  data: LoadResponseBody;
}): BulkPushState {
  if (HIDDEN_STATUSES.has(res.status)) {
    return { phase: "hidden" };
  }
  if (!res.ok || !res.data || !res.data.ok) {
    return deriveLoadErrorState();
  }
  return {
    phase: "idle",
    count: res.data.count ?? 0,
    tokenHealth: res.data.tokenHealth ?? null,
  };
}

/** Error state for a thrown/aborted GET (network failure) — always retryable. */
export function deriveLoadErrorState(): BulkPushState {
  return { phase: "error", message: LOAD_ERROR_MESSAGE };
}

const PUSH_REASON_MESSAGES: Record<string, string> = {
  not_connected: "QuickBooks isn't connected — reconnect in Settings, then retry.",
  unconfigured: "QuickBooks isn't configured — reconnect in Settings, then retry.",
};

/**
 * Error state for a POST /bulk-push that failed. Surfaces the server's reason
 * (instead of the old silent reload), falling back to a generic retry message
 * for an unknown/missing reason (e.g. a transient 500 with no JSON body).
 */
export function derivePushErrorState(reason?: string | null): BulkPushState {
  const message = (reason && PUSH_REASON_MESSAGES[reason]) ?? "Push to QuickBooks failed — retry.";
  return { phase: "error", message };
}
