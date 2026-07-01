import { LinkIcon } from "lucide-react";
import { PortalInactive } from "@shared/components/layout/PortalInactive";

/**
 * Clean public-facing state for a token that can’t be opened — revoked, unknown,
 * or (in a misconfigured deploy) no service role. Never leaks data or the reason
 * specifics beyond a friendly message.
 */
export function ShareLinkInactive({
  reason,
}: {
  reason: "not_found" | "revoked" | "unconfigured";
}) {
  const message =
    reason === "revoked"
      ? "This link is no longer active. Please ask Good Woods for a new one."
      : reason === "unconfigured"
        ? "This form isn’t available right now. Please try again later."
        : "We couldn’t find that form. Please check the link and try again.";

  return (
    <PortalInactive
      icon={LinkIcon}
      title="Link unavailable"
      message={message}
      pageType="form"
      testId="share-link-inactive"
    />
  );
}
