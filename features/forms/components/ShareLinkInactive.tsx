import { LinkIcon } from "lucide-react";

/**
 * Clean public-facing state for a token that can't be opened — revoked, unknown,
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
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4"
      data-testid="share-link-inactive"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-resting">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
          <LinkIcon className="h-5 w-5 text-text-tertiary" strokeWidth={1.75} />
        </div>
        <h1 className="font-serif text-xl text-text-primary">Link unavailable</h1>
        <p className="mt-2 text-sm text-text-secondary">{message}</p>
      </div>
    </main>
  );
}
