"use client";

import { Plus } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { SectionDef } from "@features/estimator/lib/sections";
import type { LineItem } from "@features/estimator/lib/types";
import type { LineSubtotal } from "@features/estimator/lib/totals";
import { LineItemRow } from "./LineItemRow";

export function SectionBlock({
  section,
  lines,
  lineSubtotals,
  subtotalCost,
  subtotalPrice,
  enabled,
  onToggle,
  categorySuggestions,
  categoryListId,
  onAdd,
  onUpdate,
  onRemove,
}: {
  section: SectionDef;
  lines: LineItem[]; // already filtered to this section
  lineSubtotals: LineSubtotal[]; // SAME order as lines
  subtotalCost: number;
  subtotalPrice: number;
  enabled: boolean; // only matters when section is toggleable
  onToggle?: (next: boolean) => void;
  categorySuggestions: string[];
  categoryListId: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
}) {
  const isOff = section.toggleable && !enabled;
  const showRows = !isOff && lines.length > 0;
  const showAddButton = !isOff;

  return (
    <div className={cn("border-t border-border", isOff && "opacity-60")}>
      {/* Section header — single-line divider between rows */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 bg-surface-muted/50">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs uppercase tracking-[0.08em] font-semibold text-text-primary">
            {section.label}
          </span>
          {section.description && (
            <span className="text-[11px] text-text-tertiary truncate">
              {section.description}
            </span>
          )}
        </div>

        {section.toggleable && onToggle && (
          <Toggle on={enabled} onChange={onToggle} />
        )}

        <div className="text-xs tabular-nums text-text-secondary min-w-[6rem] text-right">
          {isOff ? (
            <span className="text-text-tertiary italic">off</span>
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

      {/* Lines (only when section has any AND is on) */}
      {showRows && (
        <div className="divide-y divide-border/60">
          {lines.map((line, i) => (
            <LineItemRow
              key={line.id}
              line={line}
              subtotal={lineSubtotals[i]}
              categorySuggestions={categorySuggestions}
              categoryListId={categoryListId}
              onUpdate={(patch) => onUpdate(line.id, patch)}
              onRemove={() => onRemove(line.id)}
            />
          ))}
        </div>
      )}

      {/* Add line button (always visible when section is on) */}
      {showAddButton && (
        <button
          onClick={onAdd}
          className="w-full px-4 py-1.5 flex items-center gap-2 text-xs text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border/40"
        >
          <Plus className="h-3 w-3" strokeWidth={1.75} />
          Add line in {section.label}
        </button>
      )}
    </div>
  );
}

// Small inline switch — no external dependency.
function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-fast",
        on ? "bg-accent" : "bg-border"
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-fast",
          on ? "translate-x-3.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
