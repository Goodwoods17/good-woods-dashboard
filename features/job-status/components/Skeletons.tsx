// Loading skeletons for the Job Status surfaces. Skeletons (not spinners or
// "Loading…" text) are the product-register convention for in-content loading;
// the global `prefers-reduced-motion` rule in globals.css neutralises the pulse.

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} aria-hidden />;
}

/** Board: a grid of placeholder job cards mirroring the real card layout. */
export function BoardSkeleton() {
  return (
    <div
      className="px-4 pb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="board-skeleton"
      aria-busy="true"
      aria-label="Loading jobs"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface shadow-resting p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Block className="h-2.5 w-16" />
              <Block className="h-3.5 w-3/4" />
            </div>
            <Block className="h-4 w-8" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((__, j) => (
              <Block key={j} className="h-2 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Field view: overall bar + a few collapsed phase sections. */
export function FieldSkeleton() {
  return (
    <div className="px-4 pb-10" data-testid="field-skeleton" aria-busy="true" aria-label="Loading job status">
      <div className="mb-5 space-y-1.5">
        <Block className="h-3 w-32" />
        <Block className="h-1.5 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface shadow-resting px-4 py-3">
            <div className="flex items-center gap-3">
              <Block className="h-4 w-4" />
              <Block className="h-3.5 w-28 flex-1" />
              <Block className="h-3 w-8" />
            </div>
            <Block className="mt-3 h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Timeline: a short stack of placeholder event rows. */
export function TimelineSkeleton() {
  return (
    <ul className="divide-y divide-border" data-testid="timeline-skeleton" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex gap-3 py-3 first:pt-0">
          <Block className="h-6 w-6 flex-shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Block className="h-3 w-40" />
            <Block className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
