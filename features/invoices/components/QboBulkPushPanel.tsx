"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, Send, WifiOff } from "lucide-react";
import type { BulkPushSummary } from "../lib/qboBulkPush";
import {
  type BulkPushState,
  type LoadResponseBody,
  deriveLoadErrorState,
  deriveLoadState,
  derivePushErrorState,
} from "../lib/qboBulkPushPanelState";

/**
 * QBO S11 — Bulk catch-up push + token-health/reconnect nudge (issue #157).
 *
 * Surfaces on the /invoices list page (when NEXT_PUBLIC_INVOICES_QBO_ENABLED
 * is on). Two responsibilities:
 *
 *   1. TOKEN HEALTH: when the refresh token is aging (80+ days) or critical
 *      (95+ days), shows a banner with a "Reconnect QuickBooks" link so the
 *      owner can re-auth BEFORE the next push fails. The banner is suppressed
 *      when the connection is healthy.
 *
 *   2. BULK CATCH-UP: shows a "Push N to QuickBooks" button when there are
 *      posted invoices with no QBO Bill link. Clicking executes the bulk push
 *      (rate-limited on the server) and shows a short summary (pushed /
 *      blocked / failed).
 *
 * Both surfaces degrade gracefully: when QBO isn't configured or connected
 * the panel hides itself entirely — the standard "Connect QuickBooks" panel
 * in Settings handles the onboarding path.
 */

export function QboBulkPushPanel({ onPushed }: { onPushed?: () => void }) {
  const [state, setState] = useState<BulkPushState>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices/qbo/bulk-push", { cache: "no-store" });
      let data: LoadResponseBody = null;
      try {
        data = (await res.json()) as LoadResponseBody;
      } catch {
        // Non-JSON body (e.g. a transient 500 HTML page) — leave data null so
        // deriveLoadState surfaces a retryable error rather than a vanish.
        data = null;
      }
      setState(deriveLoadState({ status: res.status, ok: res.ok, data }));
    } catch {
      // Network throw / abort — a retryable error, NOT a silent hide (QBO-H9).
      setState(deriveLoadErrorState());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const push = useCallback(async () => {
    setState({ phase: "pushing" });
    try {
      const res = await fetch("/api/invoices/qbo/bulk-push", { method: "POST" });
      type PushResponse = { ok: boolean; summary?: BulkPushSummary; reason?: string };
      let data: PushResponse | null = null;
      try {
        data = (await res.json()) as PushResponse;
      } catch {
        data = null;
      }
      if (res.ok && data?.ok && data.summary) {
        // Keep the last-known token health visible in the done state.
        const health = state.phase === "idle" || state.phase === "done" ? state.tokenHealth : null;
        setState({ phase: "done", summary: data.summary, tokenHealth: health });
        onPushed?.();
        return;
      }
      // QBO-H9: a failed push surfaces the server's reason, not a silent reset.
      setState(derivePushErrorState(data?.reason));
    } catch {
      setState(derivePushErrorState());
    }
  }, [onPushed, state]);

  if (state.phase === "loading" || state.phase === "hidden") return null;

  const tokenHealth = state.phase === "idle" || state.phase === "done" ? state.tokenHealth : null;
  const showReconnect = tokenHealth && tokenHealth.level !== "ok";

  return (
    <div data-testid="qbo-bulk-push-panel" className="mb-5 space-y-3">
      {/* Token health reconnect nudge */}
      {showReconnect && (
        <div
          data-testid="qbo-token-health-banner"
          className={`flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            tokenHealth.level === "critical"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              {tokenHealth.level === "critical"
                ? "QuickBooks connection needs renewal"
                : "QuickBooks connection is aging"}
            </p>
            <p>{tokenHealth.message}</p>
          </div>
          <a
            data-testid="qbo-reconnect-link"
            href="/settings#quickbooks"
            className="inline-flex items-center gap-1.5 rounded-md border border-current px-3 py-1 text-xs font-medium hover:opacity-80"
          >
            <RefreshCcw className="h-3 w-3" />
            Reconnect QuickBooks
          </a>
        </div>
      )}

      {/* QBO-H9: a reachability/push failure shows a visible, retryable row
          instead of the whole catch-up bar silently vanishing. */}
      {state.phase === "error" && (
        <div
          data-testid="qbo-bulk-push-error"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-resting"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span data-testid="qbo-bulk-push-error-message" className="flex-1">
            {state.message}
          </span>
          <button
            type="button"
            data-testid="qbo-bulk-push-retry-btn"
            onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-current px-3 py-1 text-xs font-medium hover:opacity-80"
          >
            <RefreshCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Bulk push */}
      {state.phase === "idle" && state.count > 0 && (
        <div
          data-testid="qbo-bulk-push-bar"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-resting"
        >
          <span className="text-sm text-text-secondary">
            <span data-testid="qbo-unpushed-count" className="font-semibold text-text-primary">
              {state.count}
            </span>{" "}
            {state.count === 1 ? "invoice" : "invoices"} ready to push to QuickBooks
          </span>
          <button
            type="button"
            data-testid="qbo-bulk-push-btn"
            onClick={() => void push()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-ink-pill px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Send className="h-4 w-4" />
            Push {state.count === 1 ? "invoice" : `all ${state.count}`} to QuickBooks
          </button>
        </div>
      )}

      {state.phase === "pushing" && (
        <div
          data-testid="qbo-bulk-pushing"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary shadow-resting"
        >
          <Send className="h-4 w-4 animate-pulse" />
          Pushing to QuickBooks — please wait…
        </div>
      )}

      {state.phase === "done" && (
        <div
          data-testid="qbo-bulk-push-result"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-resting"
        >
          <span className="font-medium">
            {state.summary.pushed > 0
              ? `${state.summary.pushed} bill${state.summary.pushed === 1 ? "" : "s"} sent to QuickBooks`
              : "No new bills sent"}
          </span>
          {state.summary.alreadyPushed > 0 && (
            <span className="text-emerald-600">· {state.summary.alreadyPushed} already sent</span>
          )}
          {state.summary.blocked > 0 && (
            <span data-testid="qbo-bulk-push-blocked" className="text-amber-600">
              · {state.summary.blocked} blocked (missing mapping)
            </span>
          )}
          {state.summary.failed > 0 && (
            <span data-testid="qbo-bulk-push-failed" className="text-red-600">
              · {state.summary.failed} failed
            </span>
          )}
          <button
            type="button"
            data-testid="qbo-bulk-push-again-btn"
            onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <RefreshCcw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
