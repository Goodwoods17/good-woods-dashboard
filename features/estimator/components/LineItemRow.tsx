"use client";

import { Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import {
  UNITS,
  UNIT_LABELS,
  type LineItem,
  type Unit,
  unitHasWaste,
} from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { CategoryInput, NumberInput, Sub } from "./inputs";

export function LineItemRow({
  line,
  subtotal,
  categorySuggestions,
  categoryListId,
  onUpdate,
  onRemove,
}: {
  line: LineItem;
  subtotal: LineSubtotal;
  categorySuggestions: string[];
  categoryListId: string;
  onUpdate: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
}) {
  const showWaste = unitHasWaste(line.unit) || line.wastePct > 0;

  return (
    <div className="p-4 group space-y-2.5">
      {/* Row 1 — identification: category · item · description · remove */}
      <div className="grid grid-cols-[8rem_1fr_12rem_auto] gap-2 items-start">
        <CategoryInput
          value={line.category}
          onChange={(v) => onUpdate({ category: v })}
          suggestions={categorySuggestions}
          listId={categoryListId}
        />
        <input
          type="text"
          value={line.item}
          onChange={(e) => onUpdate({ item: e.target.value })}
          placeholder="Item name (e.g. 5/8 Plywood Birch Prefinished)"
          className="text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <input
          type="text"
          value={line.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Description (optional)"
          className="text-sm bg-surface-muted border border-border rounded-md px-3 py-1.5 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
        />
        <button
          onClick={onRemove}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast mt-1.5 px-1.5"
          aria-label="Remove line"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Row 2 — numbers: qty · unit · $/unit · waste% (if relevant) · markup% */}
      <div className={`grid ${showWaste ? "grid-cols-5" : "grid-cols-4"} gap-2 text-xs`}>
        <Sub label="Qty">
          <NumberInput value={line.qty} onChange={(v) => onUpdate({ qty: v })} />
        </Sub>
        <Sub label="Unit">
          <select
            value={line.unit}
            onChange={(e) => onUpdate({ unit: e.target.value as Unit })}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:border-border-strong"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Sub>
        <Sub label="$ / Unit">
          <NumberInput
            value={line.unitPrice}
            onChange={(v) => onUpdate({ unitPrice: v })}
          />
        </Sub>
        {showWaste && (
          <Sub label="Waste %">
            <NumberInput
              value={line.wastePct}
              step="1"
              onChange={(v) => onUpdate({ wastePct: v })}
            />
          </Sub>
        )}
        <Sub label="Markup %">
          <NumberInput
            value={line.markupPct}
            step="1"
            onChange={(v) => onUpdate({ markupPct: v })}
          />
        </Sub>
      </div>

      {/* Row 3 — calculated: cost · markup ($ and %) · line total */}
      <div className="pt-2 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
        {line.wastePct > 0 && (
          <span className="text-text-tertiary">
            Buying {subtotal.buyingQty.toFixed(2)} {UNIT_LABELS[line.unit]}
            <span className="text-text-tertiary/70"> ({line.qty} + {line.wastePct}% waste)</span>
          </span>
        )}
        <span className="text-text-secondary">
          Cost <span className="font-medium text-text-primary">{formatCAD(subtotal.cost)}</span>
        </span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-secondary">
          Markup <span className="font-medium text-text-primary">{line.markupPct}%</span>
          <span className="text-text-tertiary"> (+{formatCAD(subtotal.markupAmount)})</span>
        </span>
        <span className="text-text-tertiary">·</span>
        <span className="ml-auto font-semibold text-accent">
          Line {formatCAD(subtotal.price)}
        </span>
      </div>
    </div>
  );
}
