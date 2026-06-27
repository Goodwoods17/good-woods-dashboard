import { Check, CalendarCheck2 } from "lucide-react";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { ClientScheduleView as ClientScheduleViewModel } from "../lib/clientPortal";

/**
 * The public, no-login client schedule portal (S18, issue #106). Purely
 * presentational: it renders ONLY the client-safe computed view assembled
 * server-side. The buffer, internal targets, and fever chart never reach this
 * component — there is nothing to leak here.
 *
 * Mid-phases show a soft week RANGE; the install day shows ONE firm date. The
 * status pill reads "On track" until the firm date actually moves, then
 * "Date updated".
 */
export function ClientScheduleView({
  jobName,
  recipientName,
  view,
}: {
  jobName: string;
  recipientName: string | null;
  view: ClientScheduleViewModel;
}) {
  const updated = view.status === "date_updated";

  return (
    <main className="min-h-screen bg-background px-4 py-10" data-testid="client-schedule-view">
      <div className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.12em] text-text-tertiary">
            Good Woods · Project schedule
          </p>
          <h1 className="mt-2 font-serif text-2xl text-text-primary" data-testid="client-job-name">
            {jobName}
          </h1>
          {recipientName ? (
            <p className="mt-1 text-sm text-text-secondary">Prepared for {recipientName}</p>
          ) : null}
        </header>

        {/* ── Status + progress ─────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-resting">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Status</p>
              <span
                data-testid="client-status-pill"
                data-status={view.status}
                className={cn(
                  "mt-1 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
                  updated
                    ? "bg-status-blocked-soft text-status-blocked"
                    : "bg-status-on-track-soft text-status-on-track"
                )}
              >
                {view.statusLabel}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Progress</p>
              <p
                className="mt-1 text-2xl font-semibold tabular-nums text-text-primary"
                data-testid="client-percent-done"
              >
                {view.percentDone}%
              </p>
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-status-on-track transition-all duration-fast"
              style={{ width: `${view.percentDone}%` }}
            />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
                Current stage
              </dt>
              <dd className="mt-0.5 text-text-primary" data-testid="client-current-stage">
                {view.currentLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Next step</dt>
              <dd className="mt-0.5 text-text-primary" data-testid="client-next-step">
                {view.nextStepLabel}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Install day (the one firm promise) ────────────────────────────── */}
        <section
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 shadow-resting"
          data-testid="client-install-day"
        >
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-status-on-track-soft">
            <CalendarCheck2 className="h-5 w-5 text-status-on-track" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
              Your install day
            </p>
            <p
              className="text-lg font-semibold text-text-primary"
              data-testid="client-install-date"
            >
              {formatDate(view.committedInstall)}
            </p>
            {updated ? (
              <p
                className="mt-0.5 text-xs text-status-blocked"
                data-testid="client-date-updated-note"
              >
                This date has been updated since you last checked.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-text-tertiary">This is your firm install date.</p>
            )}
          </div>
        </section>

        {/* ── Milestone stepper ─────────────────────────────────────────────── */}
        <section className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-resting">
          <h2 className="text-xs uppercase tracking-[0.06em] text-text-tertiary">Milestones</h2>
          <ol className="mt-4 flex flex-col gap-4" data-testid="client-stepper">
            {view.phases.map((p) => (
              <li
                key={p.phase}
                className="flex items-start gap-3"
                data-testid={`client-step-${p.phase}`}
                data-state={p.state}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold",
                    p.state === "done"
                      ? "bg-status-on-track text-white"
                      : p.state === "current"
                        ? "bg-status-on-track-soft text-status-on-track ring-2 ring-status-on-track"
                        : "bg-surface-muted text-text-tertiary"
                  )}
                >
                  {p.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                </span>
                <div className="flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      p.state === "upcoming" ? "text-text-secondary" : "text-text-primary"
                    )}
                  >
                    {p.label}
                  </p>
                  <p
                    className="text-xs text-text-tertiary"
                    data-testid={`client-step-window-${p.phase}`}
                  >
                    {displayLabel(p.display)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-6 text-center text-xs text-text-tertiary">
          Questions about your schedule? Reply to your Good Woods email and we&apos;ll help.
        </footer>
      </div>
    </main>
  );
}

function displayLabel(display: ClientScheduleViewModel["phases"][number]["display"]): string {
  switch (display.kind) {
    case "complete":
      return "Complete";
    case "firm":
      return formatDate(display.date);
    case "range":
      return `Week of ${formatDate(display.start)}`;
    case "tbd":
      return "To be scheduled";
  }
}
