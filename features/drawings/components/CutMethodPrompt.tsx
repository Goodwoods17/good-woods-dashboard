"use client";

import type { CutMethod } from "@shared/lib/types";

export function CutMethodPrompt({
  label, onPick, onSkip,
}: { label: string; onPick: (m: CutMethod) => void; onSkip: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3 shadow-resting">
      <p className="text-sm text-text-primary">How was <span className="font-medium">{label}</span> cut?</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPick("inhouse")}
          className="min-h-[44px] flex-1 rounded-full bg-ink-pill px-3 text-sm font-medium text-white duration-fast hover:bg-accent-active">
          Table saw
        </button>
        <button type="button" onClick={() => onPick("cnc_sub")}
          className="min-h-[44px] flex-1 rounded-full border border-border bg-surface px-3 text-sm font-medium text-text-primary duration-fast hover:bg-surface-muted">
          Toolpath CNC
        </button>
      </div>
      <button type="button" onClick={onSkip} className="text-xs text-text-tertiary hover:text-text-secondary">
        Skip for now
      </button>
    </div>
  );
}
