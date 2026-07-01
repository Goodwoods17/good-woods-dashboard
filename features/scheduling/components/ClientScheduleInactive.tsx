import { LinkIcon } from "lucide-react";
import { PortalInactive } from "@shared/components/layout/PortalInactive";

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
    <PortalInactive
      icon={LinkIcon}
      title="Schedule unavailable"
      message={message}
      pageType="schedule"
      testId="client-schedule-inactive"
    />
  );
}
