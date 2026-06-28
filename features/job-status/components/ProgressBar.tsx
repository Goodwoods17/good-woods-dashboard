import { cn } from "@shared/lib/utils";

/**
 * Unified progress track for the Job Status feature — the board's per-phase mini
 * bars, the per-phase bars, and the job-level bar all render through this, so the
 * `progressbar` a11y semantics and the fill animation live in exactly one place.
 *
 * Sizing is caller-controlled via `className` (e.g. `h-1.5 w-full`, `h-1 flex-1`)
 * so the same component serves the dense board card and the roomier field view
 * without a variant enum.
 */
export function ProgressBar({
  pct,
  testId,
  className,
}: {
  /** Progress as a 0..1 fraction. */
  pct: number;
  testId?: string;
  className?: string;
}) {
  const pctInt = Math.round(Math.min(1, Math.max(0, pct)) * 100);
  return (
    // The testid lives on the always-sized track, not the fill — the fill is
    // zero-width at 0% progress, which Playwright treats as not-visible.
    <div
      data-testid={testId}
      className={cn("overflow-hidden rounded-full bg-surface-muted", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-slow"
        style={{ width: `${pctInt}%` }}
        role="progressbar"
        aria-valuenow={pctInt}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
