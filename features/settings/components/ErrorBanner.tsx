"use client";

import { AlertCircle } from "lucide-react";

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-status-blocked-soft p-4 shadow-resting">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-blocked" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-status-blocked">Storage error</div>
        <div className="mt-0.5 break-all text-xs text-text-secondary">{error}</div>
      </div>
    </div>
  );
}
