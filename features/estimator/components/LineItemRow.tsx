"use client";

import { Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import {
  UNITS,
  UNIT_LABELS,
  type LineItem,
  type Unit,
} from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { CategoryInput } from "./inputs";

// Grid template applied via inline style so it can't be silently dropped
// by Tailwind's content scanner. Both the column header and every row
// use the same template so columns align perfectly.
export const LINE_GRID_TEMPLATE =
  "7rem minmax(11rem, 1fr) 4rem 3.5rem 5.5rem 4.5rem 6rem 4.5rem 6rem 6.5rem 1.75rem";

export function LineItemRow({
  line,
  subtotal,
  categorySuggestions,
  categoryListId,
  disabled,
  onUpdate,
  onRemove,
}: {
  line: LineItem;
  subtotal: LineSubtotal;
  categorySuggestions: string[];
  categoryListId: string;
  disabled?: boolean;
  onUpdate: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
}) {
  const hasWaste = line.wastePct > 0;

  return (
    <div
      className={cn(
        "grid items-center gap-2 px-3 py-1.5 group",
        disabled && "opacity-50"
      )}
      style={{ gridTemplateColumns: LINE_GRID_TEMPLATE }}
    >
      {/* Category */}
      <CategoryInput
        value={line.category}
        onChange={(v) => onUpdate({ category: v })}
        suggestions={categorySuggestions}
        listId={categoryListId}
      />

      {/* Item (+ optional description as small subtext) */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <input
          type="text"
          value={line.item}
          onChange={(e) => onUpdate({ item: e.target.value })}
          placeholder="Item name"
          className="text-sm bg-surface-muted border border-border rounded-md px-2 py-1 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <input
          type="text"
          value={line.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="(description, optional)"
          className="text-[11px] italic bg-transparent border-0 px-2 py-0 text-text-tertiary placeholder:text-text-tertiary/60 focus:outline-none focus:bg-surface-muted focus:rounded"
        />
      </div>

      {/* Qty */}
      <NumCell value={line.qty} onChange={(v) => onUpdate({ qty: v })} />

      {/* Unit */}
      <select
        value={line.unit}
        onChange={(e) => onUpdate({ unit: e.target.value as Unit })}
        className="w-full text-sm bg-surface-muted border border-border rounded-md px-1.5 py-1 text-center focus:outline-none focus:border-border-strong"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {UNIT_LABELS[u]}
          </option>
        ))}
      </select>

      {/* $/Unit (Amount) */}
      <NumCell value={line.unitPrice} onChange={(v) => onUpdate({ unitPrice: v })} />

      {/* Waste % */}
      <NumCell
        value={line.wastePct}
        onChange={(v) => onUpdate({ wastePct: v })}
        step="1"
        muted={!hasWaste}
      />

      {/* Cost (calculated) */}
      <CalcCell value={formatCAD(subtotal.cost)}>
        {hasWaste && (
          <span className="text-[10px] text-text-tertiary leading-tight">
            {line.qty} × {(1 + line.wastePct / 100).toFixed(2)} = {subtotal.buyingQty.toFixed(2)} {UNIT_LABELS[line.unit]}
          </span>
        )}
      </CalcCell>

      {/* Markup % */}
      <NumCell value={line.markupPct} onChange={(v) => onUpdate({ markupPct: v })} step="1" />

      {/* Markup $ (calculated) */}
      <CalcCell value={`+${formatCAD(subtotal.markupAmount)}`} muted />

      {/* Line total (calculated, accent) */}
      <div className="text-right text-sm font-semibold tabular-nums text-accent px-1">
        {formatCAD(subtotal.price)}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast flex items-center justify-center"
        aria-label="Remove line"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

// ─── Cells ─────────────────────────────────────────────────────────────

function NumCell({
  value,
  onChange,
  step,
  muted,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  muted?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? "0.01"}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={cn(
        "w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-1.5 py-1 text-right focus:outline-none focus:border-border-strong",
        muted && value === 0 && "text-text-tertiary"
      )}
    />
  );
}

function CalcCell({
  value,
  muted,
  children,
}: {
  value: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-end justify-center text-right px-1">
      <span
        className={cn(
          "text-sm tabular-nums",
          muted ? "text-text-tertiary" : "text-text-secondary font-medium"
        )}
      >
        {value}
      </span>
      {children}
    </div>
  );
}
