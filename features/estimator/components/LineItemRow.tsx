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

      <div className="mt-2 pt-2 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3 text-xs tabular-nums">
        <div className="flex items-center gap-3 text-text-tertiary">
          <span>Materials: {formatCAD(subtotal.matCost)}</span>
          <span>Labour: {formatCAD(subtotal.labCost)}</span>
          <span className="ml-auto md:ml-0 font-medium text-text-secondary">
            Cost: {formatCAD(subtotal.direct)}
          </span>
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          <span className="text-text-tertiary">Markup</span>
          <input
            type="number"
            value={line.markupPct}
            step="1"
            onChange={(e) =>
              onUpdate({ markupPct: parseFloat(e.target.value) || 0 })
            }
            className="w-16 text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-0.5 focus:outline-none focus:border-border-strong"
          />
          <span className="text-text-tertiary">%</span>
          <span className="text-text-tertiary">
            (+{formatCAD(subtotal.markupAmount)})
          </span>
          <span className="ml-2 font-semibold text-accent">
            = {formatCAD(subtotal.price)}
          </span>
        </div>
      </div>
    </div>
  );
}
