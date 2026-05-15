"use client";

import { Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import type { Material } from "@features/catalog/lib/catalogStore";
import type { LineItem } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { NumberInput, Sub } from "./inputs";

export function LineItemRow({
  line,
  subtotal,
  materials,
  onUpdate,
  onRemove,
  onPickMaterial,
}: {
  line: LineItem;
  subtotal: LineSubtotal;
  materials: Material[];
  onUpdate: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  onPickMaterial: (materialId: string) => void;
}) {
  return (
    <div className="p-4 group">
      <div className="flex items-start gap-3 mb-3">
        <input
          type="text"
          value={line.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Line description (e.g. Lower cabinets — 7 boxes)"
          className="flex-1 text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <button
          onClick={onRemove}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast mt-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Sub label="Qty (sqft)">
          <NumberInput value={line.qty} onChange={(v) => onUpdate({ qty: v })} />
        </Sub>
        <Sub label="Material">
          <select
            value={line.materialId ?? ""}
            onChange={(e) => onPickMaterial(e.target.value)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:border-border-strong"
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Sub>
        <Sub label="$ / sqft">
          <NumberInput
            value={line.materialPricePerSqft}
            onChange={(v) => onUpdate({ materialPricePerSqft: v })}
          />
        </Sub>
        <Sub label="Labour hrs">
          <NumberInput
            value={line.labourHours}
            onChange={(v) => onUpdate({ labourHours: v })}
          />
        </Sub>
        <Sub label="$ / hr">
          <NumberInput
            value={line.labourRate}
            onChange={(v) => onUpdate({ labourRate: v })}
          />
        </Sub>
      </div>
      <div className="text-xs text-text-tertiary tabular-nums mt-2 pt-2 border-t border-border flex items-center gap-4">
        <span>Materials: {formatCAD(subtotal.matCost)}</span>
        <span>Labour: {formatCAD(subtotal.labCost)}</span>
        <span className="ml-auto font-medium text-text-secondary">
          Direct: {formatCAD(subtotal.total)}
        </span>
      </div>
    </div>
  );
}
