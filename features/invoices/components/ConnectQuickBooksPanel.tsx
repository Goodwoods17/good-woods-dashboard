"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2, Unplug } from "lucide-react";

/**
 * Owner-only "Connect QuickBooks" settings panel (QBO S1, issue #147). Drives
 * the OAuth connection tracer: connect the QuickBooks company, see the
 * connected state, and disconnect. The riskiest assumption of the QBO milestone
 * — OAuth → encrypted token → QBO sandbox — is proven by this round-trip.
 *
 * Renders only when NEXT_PUBLIC_INVOICES_QBO_ENABLED is on (gated by the parent
 * SettingsView). Degrades gracefully: when the QBO OAuth creds are absent the
 * status probe reports `configured:false` and we show a clear "not configured"
 * state instead of a dead button — mirrors the S23 Google Calendar panel.
 *
 * QBO S12 (issue #158): the description now dynamically shows whether the
 * deployment targets the sandbox or production QB company (driven by
 * QBO_ENVIRONMENT). A production warning badge fires when targeting live QB so
 * the owner knows they're about to connect a real company.
 */
type Status =
  | { phase: "loading" }
  | { phase: "not_configured"; configuredEnvironment: string }
  | { phase: "disconnected"; configuredEnvironment: string }
  | {
      phase: "connected";
      companyName: string | null;
      environment: string | null;
      configuredEnvironment: string;
    }
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
        configuredEnvironment: string;
      };
      const configuredEnvironment = data.configuredEnvironment ?? "sandbox";
      if (!data.configured) setStatus({ phase: "not_configured", configuredEnvironment });
      else if (data.connected)
        setStatus({
          phase: "connected",
          companyName: data.companyName,
          environment: data.environment,
          configuredEnvironment,
        });
      else setStatus({ phase: "disconnected", configuredEnvironment });
    } catch {
      setStatus({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Surface the callback result (e.g. ?qbo=connected) as a one-line notice, then
  // strip the param from the URL so a refresh / back-nav doesn't replay the
  // stale notice (and the address bar stays clean).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qbo = params.get("qbo");
    if (qbo && REDIRECT_MESSAGES[qbo]) setNotice(REDIRECT_MESSAGES[qbo]);
    if (qbo) {
      params.delete("qbo");
      const search = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
      );
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/invoices/qbo/disconnect", { method: "POST" });
      if (!res.ok) {
        // Don't swallow a failed disconnect — the owner needs to know the
        // connection is still live rather than silently assume it's gone.
        setNotice("Couldn't disconnect QuickBooks. Please try again.");
        return;
      }
      setNotice("QuickBooks disconnected.");
      await loadStatus();
    } catch {
      setNotice("Couldn't reach QuickBooks to disconnect. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  // Derive the configured environment label for the description text.
  const configuredEnvironment =
    status.phase !== "loading" && status.phase !== "error"
      ? (status as { configuredEnvironment: string }).configuredEnvironment
      : null;

  const isProduction = configuredEnvironment === "production";

  return (
    <div data-testid="qbo-connect-panel">
      <p className="text-sm leading-relaxed text-text-secondary">
        Connect your QuickBooks company so posted invoices can sync as bills. The refresh token is
        stored encrypted and never leaves the server.
        {configuredEnvironment ? (
          <>
            {" "}
            Targeting the{" "}
            <span data-testid="qbo-configured-env" className="font-medium text-text-primary">
              {configuredEnvironment}
            </span>{" "}
            environment.
          </>
        ) : null}
      </p>

      {/* Production warning — the owner needs to know before connecting live QB */}
      {isProduction && (
        <div
          data-testid="qbo-prod-warning"
          className="mt-3 flex items-start gap-2 rounded-lg bg-status-blocked-soft px-4 py-3 text-sm text-status-blocked"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            This deployment targets <strong>production</strong> QuickBooks. Connecting will link
            your live QB company — not a sandbox. Complete the go-live checklist before proceeding.
          </span>
        </div>
      )}

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
