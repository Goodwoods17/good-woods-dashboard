"use client";

import { FieldInput } from "./inputs";

export function MarkupSection({
  overheadPct,
  defaultMarkupPct,
  onOverhead,
  onDefaultMarkup,
}: {
  overheadPct: number;
  defaultMarkupPct: number;
  onOverhead: (v: number) => void;
  onDefaultMarkup: (v: number) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Defaults</h2>
      <p className="text-xs text-text-tertiary mb-3">
        Overhead applies to the whole quote. Default markup seeds new lines —
        each line can override.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <FieldInput
          label="Overhead %"
          value={String(overheadPct)}
          onChange={(v) => onOverhead(parseFloat(v) || 0)}
          type="number"
        />
        <FieldInput
          label="Default markup %"
          value={String(defaultMarkupPct)}
          onChange={(v) => onDefaultMarkup(parseFloat(v) || 0)}
          type="number"
        />
      </div>
    </section>
  );
}
