"use client";

import type { FormInstanceField } from "@shared/lib/types";
import { computeProgress } from "../lib/shareLink";
import { getFieldEntry } from "../lib/fieldRegistry";
import { isFieldVisible } from "../lib/conditionals";

/**
 * Live completeness meter shown during fill-time (both in-app FormFillSurface and
 * public PublicFillView). Updates reactively as fields change. Excludes layout
 * (section) fields and Slice-1-hidden (showWhen) fields from both numerator and
 * denominator — consistent with the progress column persisted on submit.
 */
export function CompletionMeter({ fields }: { fields: FormInstanceField[] }) {
  const answerable = fields.filter((f) => {
    if (!isFieldVisible(f, fields)) return false;
    const entry = getFieldEntry(f.type);
    return entry ? !entry.isLayout : false;
  });

  if (answerable.length === 0) return null;

  const pct = computeProgress(fields);
  const done = Math.round((pct / 100) * answerable.length);

  return (
    <div data-testid="completeness-meter" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-tertiary">
          {done} of {answerable.length} required complete
        </span>
        <span className="text-xs font-medium text-text-secondary">{pct}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% complete`}
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
