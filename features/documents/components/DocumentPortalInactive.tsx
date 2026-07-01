import { FileLock2 } from "lucide-react";
import { PortalInactive } from "@shared/components/layout/PortalInactive";

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
    <PortalInactive
      icon={FileLock2}
      title="Documents unavailable"
      message={message}
      pageType="documents"
      testId="document-portal-inactive"
    />
  );
}
