"use client";

import { X } from "lucide-react";

/**
 * Inline, dismissible error affordance for the Forms feature (Phase C — surface
 * swallowed store/network errors). Used consistently by the job Forms tab, the
 * forms builder, and the share panel so a failed load / create / send no longer
 * fails silently. Token styles only; `role="alert"` for screen readers.
 */
export function FormsErrorBanner({
  message,
  onDismiss,
  testId = "forms-error",
}: {
  message: string;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="mb-3 flex items-start justify-between gap-2 rounded-md bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked"
    >
      <span className="min-w-0">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded p-0.5 text-status-blocked transition-opacity hover:opacity-70"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
