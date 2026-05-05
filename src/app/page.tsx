export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl bg-surface border border-border p-10 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-2 w-2 rounded-sm bg-accent" />
            <span className="text-xs uppercase tracking-[0.04em] text-text-tertiary">
              Good Woods
            </span>
          </div>

          <h1 className="text-3xl font-semibold text-text-primary mb-3">
            Dashboard
          </h1>
          <p className="text-base text-text-secondary mb-10 max-w-md">
            Custom cabinetry &amp; millwork — pipeline, pricing, and margins, in
            one quiet place.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            <StatusChip label="On Track" tone="on-track" />
            <StatusChip label="At Risk" tone="at-risk" />
            <StatusChip label="Blocked" tone="blocked" />
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-border">
            <div>
              <div className="text-xs text-text-tertiary uppercase tracking-[0.04em] mb-1">
                Build status
              </div>
              <div className="text-md font-medium text-text-primary">
                M1 — Jobs slice · scaffold complete
              </div>
            </div>
            <button className="rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors duration-fast ease-standard">
              Continue →
            </button>
          </div>
        </div>

        <p className="text-xs text-text-tertiary text-center mt-6 tabular-nums">
          v0.0.1 · 2026-05-04
        </p>
      </div>
    </main>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "on-track" | "at-risk" | "blocked";
}) {
  const toneStyles = {
    "on-track": "bg-status-on-track-soft text-status-on-track",
    "at-risk": "bg-status-at-risk-soft text-status-at-risk",
    blocked: "bg-status-blocked-soft text-status-blocked",
  } as const;

  const dotStyles = {
    "on-track": "bg-status-on-track",
    "at-risk": "bg-status-at-risk",
    blocked: "bg-status-blocked",
  } as const;

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 ${toneStyles[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[tone]}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
