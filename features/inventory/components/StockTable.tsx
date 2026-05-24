"use client";

import { Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { StockEntry } from "@features/inventory/lib/inventoryStore";
import type { Material } from "@features/catalog/lib/catalogStore";

export function StockTable({
  stock,
  materials,
  onUpdate,
  onAdd,
  onRemove,
}: {
  stock: StockEntry[];
  materials: Material[];
  onUpdate: (id: string, patch: Partial<StockEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <Th>Material</Th>
            <Th align="right">On hand</Th>
            <Th align="right">Reorder at</Th>
            <Th>Unit</Th>
            <Th align="right">Replacement value</Th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {stock.map((entry) => {
            const mat = materials.find((m) => m.id === entry.materialId);
            const low = entry.qtyOnHand < entry.reorderPoint;
            const value = (mat?.unitPrice ?? 0) * entry.qtyOnHand;
            return (
              <tr
                key={entry.id}
                className="border-b border-border last:border-0 group hover:bg-surface-muted/30 transition-colors duration-fast"
              >
                <td className="px-4 py-2.5">
                  <select
                    value={entry.materialId}
                    onChange={(e) =>
                      onUpdate(entry.id, { materialId: e.target.value })
                    }
                    className="text-sm bg-transparent border-0 px-2 py-1 focus:outline-none focus:bg-surface-muted rounded text-text-primary"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="number"
                    value={entry.qtyOnHand}
                    onChange={(e) =>
                      onUpdate(entry.id, {
                        qtyOnHand: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={cn(
                      "w-20 text-right tabular-nums bg-transparent border-0 px-2 py-1 text-sm rounded focus:outline-none focus:bg-surface-muted",
                      low && "text-status-at-risk font-medium"
                    )}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="number"
                    value={entry.reorderPoint}
                    onChange={(e) =>
                      onUpdate(entry.id, {
                        reorderPoint: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 text-right tabular-nums bg-transparent border-0 px-2 py-1 text-sm rounded focus:outline-none focus:bg-surface-muted text-text-secondary"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={entry.unit}
                    onChange={(e) => onUpdate(entry.id, { unit: e.target.value })}
                    className="w-24 bg-transparent border-0 px-2 py-1 text-sm text-text-secondary rounded focus:outline-none focus:bg-surface-muted"
                  />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                  {formatCAD(value)}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => onRemove(entry.id)}
                    className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        onClick={onAdd}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Add SKU
      </button>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary`}
    >
      {children}
    </th>
  );
}
