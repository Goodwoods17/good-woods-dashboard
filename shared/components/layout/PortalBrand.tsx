/**
 * Shared branded header bar for all public, no-login portal pages (S13, ADR 0024).
 *
 * Renders consistently across /d (documents), /f (forms), /s (schedules) and their
 * inactive states so that clients, designers, and GCs always see the same Good Woods
 * identity — an anti-phishing legitimacy anchor that every no-login portal shares.
 *
 * Design mirrors the established PublicFillView header: full-bleed bg-canvas-top bar,
 * serif wordmark, optional subtitle that contextualises the portal type.
 */

const PORTAL_TYPE_LABELS: Record<string, string> = {
  documents: "Project documents",
  "file-request": "File request",
  schedule: "Project schedule",
  form: "Project form",
};

export function PortalBrand({
  pageType,
}: {
  /** A hint that sets the subtitle. Omit for a generic "Spacecraft Joinery" line. */
  pageType?: keyof typeof PORTAL_TYPE_LABELS | (string & object);
}) {
  const subtitle =
    pageType && PORTAL_TYPE_LABELS[pageType]
      ? PORTAL_TYPE_LABELS[pageType]
      : "Spacecraft Joinery";

  return (
    <div
      data-testid="portal-brand"
      className="border-b border-border bg-canvas-top px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        {/* Wordmark — serif logotype matching the dashboard identity */}
        <span
          className="font-serif text-lg font-semibold tracking-tight text-text-primary"
          aria-label="Good Woods"
        >
          Good Woods
        </span>
        <span className="text-border-strong" aria-hidden>
          ·
        </span>
        <span className="text-sm text-text-tertiary">{subtitle}</span>
      </div>
    </div>
  );
}
