import { FileLock2 } from "lucide-react";
import { PortalBrand } from "@shared/components/layout/PortalBrand";

/**
 * Clean public-facing state for a document-view token that can’t be opened —
 * revoked, expired, unknown, or (in a misconfigured deploy) no service role.
 * Never leaks data or which specific reason beyond a friendly message.
 */
export function DocumentPortalInactive({
  reason,
}: {
  reason: "not_found" | "revoked" | "expired" | "unconfigured";
}) {
  const message =
    reason === "revoked"
      ? "This document link is no longer active. Please ask Good Woods for a new one."
      : reason === "expired"
        ? "This document link has expired. Please ask Good Woods for a fresh one."
        : reason === "unconfigured"
          ? "These documents aren’t available right now. Please try again later."
          : "We couldn’t find those documents. Please check the link and try again.";

  return (
    <main
      className="flex min-h-screen flex-col bg-background"
      data-testid="document-portal-inactive"
    >
      <PortalBrand pageType="documents" />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-resting">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <FileLock2 className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
          </div>
          <h1 className="font-serif text-xl text-text-primary">Documents unavailable</h1>
          <p className="mt-2 text-sm text-text-secondary">{message}</p>
        </div>
      </div>
    </main>
  );
}
