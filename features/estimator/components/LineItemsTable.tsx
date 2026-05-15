"use client";

import { Plus } from "lucide-react";
import type { Material } from "@features/catalog/lib/catalogStore";
import type { LineItem } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { LineItemRow } from "./LineItemRow";

export function LineItemsTable({
  lines,
  lineSubtotals,
  materials,
  onAdd,
  onUpdate,
  onRemove,
  onPickMaterial,
}: {
  lines: LineItem[];
  lineSubtotals: LineSubtotal[];
  materials: Material[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
  onPickMaterial: (lineId: string, materialId: string) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Line items</h2>
        <span className="text-xs text-text-tertiary">
          {lines.length} item{lines.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="divide-y divide-border">
        {lines.map((line) => {
          const sub = lineSubtotals.find((s) => s.id === line.id)!;
          return (
            <LineItemRow
              key={line.id}
              line={line}
              subtotal={sub}
              materials={materials}
              onUpdate={(patch) => onUpdate(line.id, patch)}
              onRemove={() => onRemove(line.id)}
              onPickMaterial={(matId) => onPickMaterial(line.id, matId)}
            />
          );
        })}
        <button
          onClick={onAdd}
          className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          Add line
        </button>
      </div>
    </section>
  );
}
