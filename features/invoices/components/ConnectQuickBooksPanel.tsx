"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Unplug } from "lucide-react";

/**
 * Owner-only "Connect QuickBooks" settings panel (QBO S1, issue #147). Drives
 * the OAuth connection tracer: connect the QuickBooks (sandbox) company, see the
 * connected state, and disconnect. The riskiest assumption of the QBO milestone
 * — OAuth → encrypted token → QBO sandbox — is proven by this round-trip.
 *
 * Renders only when NEXT_PUBLIC_INVOICES_QBO_ENABLED is on (gated by the parent
 * SettingsView). Degrades gracefully: when the QBO OAuth creds are absent the
 * status probe reports `configured:false` and we show a clear "not configured"
 * state instead of a dead button — mirrors the S23 Google Calendar panel.
 */
type Status =
  | { phase: "loading" }
  | { phase: "not_configured" }
  | { phase: "disconnected" }
  | { phase: "connected"; companyName: string | null; environment: string | null }
  | { phase: "error" };

const REDIRECT_MESSAGES: Record<string, string> = {
  connected: "QuickBooks connected.",
  denied: "Connection cancelled — QuickBooks access was not granted.",
  invalid_state: "Connection failed a security check. Please try again.",
  no_realm: "QuickBooks did not return a company. Please try again.",
  no_refresh_token: "QuickBooks did not return a refresh token. Please try again.",
  unconfigured: "QuickBooks is not configured on this server yet.",
  error: "Could not complete the QuickBooks connection.",
};

export function ConnectQuickBooksPanel() {
  const [status, setStatus] = useState<Status>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices/qbo/status", { cache: "no-store" });
      if (!res.ok) {
        setStatus({ phase: "error" });
        return;
      }
      const data = (await res.json()) as {
        configured: boolean;
        connected: boolean;
        companyName: string | null;
        environment: string | null;
      };
      if (!data.configured) setStatus({ phase: "not_configured" });
      else if (data.connected)
        setStatus({
          phase: "connected",
          companyName: data.companyName,
          environment: data.environment,
        });
      else setStatus({ phase: "disconnected" });
    } catch {
      setStatus({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Surface the callback result (e.g. ?qbo=connected) as a one-line notice.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qbo = new URLSearchParams(window.location.search).get("qbo");
    if (qbo && REDIRECT_MESSAGES[qbo]) setNotice(REDIRECT_MESSAGES[qbo]);
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      await fetch("/api/invoices/qbo/disconnect", { method: "POST" });
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  return (
    <div data-testid="qbo-connect-panel">
      <p className="text-sm leading-relaxed text-text-secondary">
        Connect your QuickBooks company so posted invoices can sync as bills. This connects to the
        QuickBooks <span className="font-medium text-text-primary">sandbox</span> for now; the
        refresh token is stored encrypted and never leaves the server.
      </p>

      {status.phase === "loading" && (
        <p className="mt-4 text-sm text-text-tertiary" data-testid="qbo-loading">
          Checking connection…
        </p>
      )}

      {status.phase === "not_configured" && (
        <div
          data-testid="qbo-not-configured"
          className="mt-4 rounded-lg bg-status-blocked-soft px-4 py-3 text-sm text-status-blocked"
        >
          QuickBooks is not configured on this server yet. Add the QuickBooks OAuth credentials to
          enable the connection.
        </div>
      )}

      {status.phase === "error" && (
        <p className="mt-4 text-sm text-status-blocked" data-testid="qbo-error">
          Couldn&apos;t reach the QuickBooks connection service.
        </p>
      )}

      {status.phase === "disconnected" && (
        <div className="mt-4">
          <a
            data-testid="qbo-connect"
            href="/api/invoices/qbo/connect"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary"
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Connect QuickBooks
          </a>
        </div>
      )}

      {status.phase === "connected" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-text-secondary" data-testid="qbo-connected">
            Connected
            {status.companyName ? (
              <span className="text-text-tertiary"> · {status.companyName}</span>
            ) : null}
            {status.environment ? (
              <span className="text-text-tertiary"> · {status.environment}</span>
            ) : null}
          </p>
          <div>
            <button
              type="button"
              data-testid="qbo-disconnect"
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-tertiary transition-colors duration-fast hover:border-border-strong hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Disconnect
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className="mt-3 text-xs text-text-tertiary" data-testid="qbo-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
