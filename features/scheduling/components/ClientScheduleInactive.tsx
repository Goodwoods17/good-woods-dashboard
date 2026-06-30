import { LinkIcon } from "lucide-react";
import { PortalBrand } from "@shared/components/layout/PortalBrand";

/**
 * Clean public-facing state for a schedule token that can’t be opened — revoked,
 * unknown, or (in a misconfigured deploy) no service role. Never leaks data or
 * the reason specifics beyond a friendly message.
 */
export function ClientScheduleInactive({
  reason,
}: {
  reason: "not_found" | "revoked" | "unconfigured";
}) {
  const message =
    reason === "revoked"
      ? "This schedule link is no longer active. Please ask Good Woods for a new one."
      : reason === "unconfigured"
        ? "This schedule isn’t available right now. Please try again later."
        : "We couldn’t find that schedule. Please check the link and try again.";

  return (
    <main
      className="flex min-h-screen flex-col bg-background"
      data-testid="client-schedule-inactive"
    >
      <PortalBrand pageType="schedule" />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-resting">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <LinkIcon className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
          </div>
          <h1 className="font-serif text-xl text-text-primary">Schedule unavailable</h1>
          <p className="mt-2 text-sm text-text-secondary">{message}</p>
        </div>
      </div>
    </main>
  );
}
