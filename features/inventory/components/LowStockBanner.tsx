"use client";

import { PackageCheck } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import type { StockEntry } from "@features/inventory/lib/inventoryStore";

/**
 * "Reorder now" lead: the reason you open this page. Lists what's at or below
 * its reorder point and not yet on order, each with a one-tap "Reordered".
 * On-order items sit quietly below until they're restocked.
 */
export function ReorderNow({
  low,
  onOrder,
  onReordered,
}: {
  low: StockEntry[];
  onOrder: StockEntry[];
  onReordered: (id: string) => void;
}) {
  if (low.length === 0 && onOrder.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-surface px-4 py-3 shadow-resting">
        <PackageCheck className="h-4 w-4 text-status-on-track" strokeWidth={2} />
        <p className="text-sm text-text-secondary">
          Stock looks healthy. Nothing below its reorder point.
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-resting">
      {low.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <h2 className="font-serif text-title font-medium text-text-primary">Reorder now</h2>
            <span className="font-mono text-xs tabular-nums text-status-at-risk">
              {low.length} low
            </span>
          </div>
          <ul className="divide-y divide-border-faint">
            {low.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-status-at-risk" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{s.materialName}</p>
                  <p className="font-mono text-xs tabular-nums text-text-tertiary">
                    {s.qtyOnHand}/{s.reorderPoint} {s.unit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onReordered(s.id)}
                  className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover"
                >
                  Reordered
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {onOrder.length > 0 && (
        <div className="bg-surface-muted/40 px-4 py-2.5">
          <p className="font-mono text-micro uppercase tracking-wider text-text-tertiary">
            On order
          </p>
          <ul className="mt-1 space-y-0.5">
            {onOrder.map((s) => (
              <li key={s.id} className="text-xs text-text-secondary">
                {s.materialName}{" "}
                <span className="font-mono tabular-nums text-text-tertiary">
                  ({s.qtyOnHand}/{s.reorderPoint} {s.unit} ·{" "}
                  {formatCAD(s.unitValue * Math.max(0, s.reorderPoint - s.qtyOnHand))} to restock)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
