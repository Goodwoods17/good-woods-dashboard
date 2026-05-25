"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { SectionDef } from "@features/estimator/lib/sections";
import type { LineItem, Room } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { LineItemRow } from "./LineItemRow";

export function SectionBlock({
  section,
  lines,
  lineSubtotals,
  subtotalCost,
  subtotalPrice,
  rooms,
  categorySuggestions,
  categoryListId,
  onAdd,
  onUpdate,
  onRemove,
  customHeaderRight,
  children,
}: {
  section: SectionDef;
  lines: LineItem[];
  lineSubtotals: LineSubtotal[];
  subtotalCost: number;
  subtotalPrice: number;
  rooms?: Room[];
  categorySuggestions: string[];
  categoryListId: string;
  onAdd?: () => void; // omit for structured layouts that don't use line items
  onUpdate?: (id: string, patch: Partial<LineItem>) => void;
  onRemove?: (id: string) => void;
  customHeaderRight?: ReactNode; // e.g. internal-cost label for pre-work
  children?: ReactNode; // structured-layout content (PreWorkBlock, DeliveryCalculator, etc.)
}) {
  const isStructured = section.layout && section.layout !== "lines";
  const showRows = !isStructured && lines.length > 0;
  const showAddButton = !isStructured && !!onAdd;

  return (
    <div className="border-t border-border">
      {/* Section header — single-line divider between rows */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 bg-surface-muted/50">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs uppercase tracking-[0.08em] font-semibold text-text-primary">
            {section.label}
          </span>
          {section.description && (
            <span className="text-caption text-text-tertiary truncate">
              {section.description}
            </span>
          )}
        </div>

        <div className="text-xs tabular-nums text-text-secondary min-w-[6rem] text-right">
          {customHeaderRight ? (
            customHeaderRight
          ) : isStructured ? (
            <span className="font-medium text-text-primary">
              {formatCAD(subtotalPrice)}
            </span>
          ) : lines.length === 0 ? (
            <span className="text-text-tertiary">no lines</span>
          ) : (
            <>
              <span className="text-text-tertiary">{lines.length}× · </span>
              <span className="font-medium text-text-primary">
                {formatCAD(subtotalPrice)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Structured content (PreWork / Delivery / Deficiencies) */}
      {isStructured && children}

      {/* Lines (only for layout = "lines" and section has any) */}
      {showRows && onUpdate && onRemove && (
        <div className="divide-y divide-border/60">
          {lines.map((line, i) => (
            <LineItemRow
              key={line.id}
              line={line}
              subtotal={lineSubtotals[i]}
              categorySuggestions={categorySuggestions}
              categoryListId={categoryListId}
              rooms={rooms}
              onUpdate={(patch) => onUpdate(line.id, patch)}
              onRemove={() => onRemove(line.id)}
            />
          ))}
        </div>
      )}

      {/* Add line button (only for layout = "lines") */}
      {showAddButton && (
        <button
          onClick={onAdd}
          className={cn(
            "w-full px-4 py-1.5 flex items-center gap-2 text-xs text-text-tertiary",
            "hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border/40",
          )}
        >
          <Plus className="h-3 w-3" strokeWidth={1.75} />
          Add line in {section.label}
        </button>
      )}

      {/* Cost subtotal underline (only when there's content beyond zero) */}
      {(showRows || isStructured) && subtotalCost > 0 && !customHeaderRight && (
        <div className="px-4 py-1.5 border-t border-border/40 flex justify-end items-center gap-3 text-caption text-text-tertiary">
          <span>Cost {formatCAD(subtotalCost)}</span>
        </div>
      )}
    </div>
  );
}
