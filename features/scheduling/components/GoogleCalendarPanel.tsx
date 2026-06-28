"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, RefreshCw, Unplug } from "lucide-react";
import type { Job } from "@shared/lib/types";

/**
 * Owner-only "Connect Google Calendar" panel in the Schedule tab (S23, issue
 * #111). Drives the one-way push: connect the account, then push this job's
 * schedule (internal phase targets + the committed install) into the owner's
 * calendar. The app is the source of truth — we never read back.
 *
 * Renders only when NEXT_PUBLIC_SCHEDULING_P6_ENABLED is on (gated by the parent
 * ScheduleTab). Degrades gracefully: when the Google OAuth creds are absent the
 * status probe reports `configured:false` and we show a clear "not configured"
 * state instead of a dead button — mirrors the Resend unconfigured fallback.
 */
type Status =
  | { phase: "loading" }
  | { phase: "not_configured" }
  | { phase: "disconnected" }
  | { phase: "connected"; accountEmail: string | null }
  | { phase: "error" };

export function GoogleCalendarPanel({ job }: { job: Job }) {
  const [status, setStatus] = useState<Status>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduling/google/status", { cache: "no-store" });
      if (!res.ok) {
        setStatus({ phase: "error" });
        return;
      }
      const data = (await res.json()) as {
        configured: boolean;
        connected: boolean;
        accountEmail: string | null;
      };
      if (!data.configured) setStatus({ phase: "not_configured" });
      else if (data.connected) setStatus({ phase: "connected", accountEmail: data.accountEmail });
      else setStatus({ phase: "disconnected" });
    } catch {
      setStatus({ phase: "error" });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const push = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/scheduling/google/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        created?: number;
        updated?: number;
        deleted?: number;
        reason?: string;
      };
      if (data.ok) {
        setResult(
          `Pushed: ${data.created ?? 0} added, ${data.updated ?? 0} updated, ${data.deleted ?? 0} removed.`
        );
      } else {
        setResult(`Could not push (${data.reason ?? "error"}).`);
      }
    } catch {
      setResult("Could not push (network error).");
    } finally {
      setBusy(false);
    }
  }, [job.id]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      await fetch("/api/scheduling/google/disconnect", { method: "POST" });
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  return (
    <section data-testid="google-push-panel" className="bg-surface rounded-xl shadow-resting p-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-text-tertiary" strokeWidth={1.75} aria-hidden />
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
          Google Calendar push
        </h3>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        One-way: the shop schedule (internal phase targets and the committed install) is pushed into
        your Google Calendar. Good Woods stays the source of truth — calendar edits are overwritten
        on the next push.
      </p>

      {status.phase === "loading" && (
        <p className="mt-4 text-sm text-text-tertiary" data-testid="google-push-loading">
          Checking connection…
        </p>
      )}

      {status.phase === "not_configured" && (
        <div
          data-testid="google-push-not-configured"
          className="mt-4 rounded-lg bg-status-blocked-soft px-4 py-3 text-sm text-status-blocked"
        >
          Google Calendar is not configured on this server yet. Add the Google OAuth credentials to
          enable the push.
        </div>
      )}

      {status.phase === "error" && (
        <p className="mt-4 text-sm text-status-blocked" data-testid="google-push-error">
          Couldn&apos;t reach the Google connection service.
        </p>
      )}

      {status.phase === "disconnected" && (
        <div className="mt-4">
          <a
            data-testid="google-push-connect"
            href="/api/scheduling/google/connect"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
          >
            <CalendarCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Connect Google Calendar
          </a>
        </div>
      )}

      {status.phase === "connected" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-text-secondary" data-testid="google-push-connected">
            Connected
            {status.accountEmail ? (
              <span className="text-text-tertiary"> · {status.accountEmail}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="google-push-sync"
              onClick={push}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Push this schedule
            </button>
            <button
              type="button"
              data-testid="google-push-disconnect"
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary hover:border-border-strong transition-colors duration-fast disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              Disconnect
            </button>
          </div>
        </div>
      )}

      {result && (
        <p
          className="mt-3 text-xs text-text-tertiary"
          data-testid="google-push-result"
          role="status"
        >
          {result}
        </p>
      )}
    </section>
  );
}
