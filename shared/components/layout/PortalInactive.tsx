import type { LucideIcon } from "lucide-react";
import { PortalBrand } from "@shared/components/layout/PortalBrand";

/**
 * Shared "token dead → friendly card" state for every public, no-login portal
 * (documents /d, forms /f, schedules /s). Renders the shared PortalBrand header
 * plus a centered card with an icon bubble, serif title, and a friendly message.
 * Never leaks data or the specific reason beyond the caller-supplied message.
 *
 * Each feature keeps its own thin wrapper (with its own reason→message map,
 * icon, title, pageType, and data-testid) so behaviour and testids stay exactly
 * as the live Forms/Scheduling portals and the e2e specs expect.
 */
export function PortalInactive({
  icon: Icon,
  title,
  message,
  pageType,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  /** Forwarded to PortalBrand to contextualise the header subtitle. */
  pageType?: string;
  /** data-testid on the <main>, preserved per-portal for the e2e specs. */
  testId?: string;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-background" data-testid={testId}>
      <PortalBrand pageType={pageType} />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-resting">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <Icon className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
          </div>
          <h1 className="font-serif text-xl text-text-primary">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{message}</p>
        </div>
      </div>
    </main>
  );
}
