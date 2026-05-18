"use client";

import { AlertCircle } from "lucide-react";

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <div className="bg-status-blocked-soft border border-status-blocked/30 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle
        className="h-4 w-4 text-status-blocked shrink-0 mt-0.5"
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-status-blocked mb-0.5">
          Storage error
        </div>
        <div className="text-xs text-text-secondary break-all">{error}</div>
      </div>
    </div>
  );
}
