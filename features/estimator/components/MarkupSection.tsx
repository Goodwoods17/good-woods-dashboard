"use client";

import { FieldInput } from "./inputs";

export function MarkupSection({
  overheadPct,
  marginPct,
  onOverhead,
  onMargin,
}: {
  overheadPct: number;
  marginPct: number;
  onOverhead: (v: number) => void;
  onMargin: (v: number) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Markup</h2>
      <div className="grid grid-cols-2 gap-4">
        <FieldInput
          label="Overhead %"
          value={String(overheadPct)}
          onChange={(v) => onOverhead(parseFloat(v) || 0)}
          type="number"
        />
        <FieldInput
          label="Target margin %"
          value={String(marginPct)}
          onChange={(v) => onMargin(parseFloat(v) || 0)}
          type="number"
        />
      </div>
    </section>
  );
}
