"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

type StockEntry = {
  id: string;
  materialId: string;
  qtyOnHand: number;
  reorderPoint: number;
  unit: string;
};

const STOCK_KEY = "gw_inventory_v1";

const SEED_STOCK: StockEntry[] = [
  { id: "s1", materialId: "m1", qtyOnHand: 24, reorderPoint: 12, unit: "bd-ft" },
  { id: "s2", materialId: "m3", qtyOnHand: 8, reorderPoint: 6, unit: "sheets" },
  { id: "s3", materialId: "m4", qtyOnHand: 4, reorderPoint: 6, unit: "sheets" },
  { id: "s4", materialId: "m6", qtyOnHand: 32, reorderPoint: 16, unit: "rolls" },
  { id: "s5", materialId: "m7", qtyOnHand: 18, reorderPoint: 30, unit: "pairs" },
];

function loadStock(): StockEntry[] {
  if (typeof window === "undefined") return SEED_STOCK;
  try {
    const raw = window.localStorage.getItem(STOCK_KEY);
    if (!raw) return SEED_STOCK;
    return JSON.parse(raw);
  } catch {
    return SEED_STOCK;
  }
}

function saveStock(stock: StockEntry[]) {
  try {
    window.localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  } catch {
    /* silent */
  }
}

export default function InventoryPage() {
  const { materials } = useCatalog();
  const [stock, setStock] = useState<StockEntry[]>(SEED_STOCK);

  useEffect(() => {
    setStock(loadStock());
  }, []);

  function update(id: string, patch: Partial<StockEntry>) {
    setStock((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      saveStock(next);
      return next;
    });
  }

  function add() {
    setStock((prev) => {
      const next = [
        ...prev,
        {
          id: `s${Date.now()}`,
          materialId: materials[0]?.id ?? "",
          qtyOnHand: 0,
          reorderPoint: 0,
          unit: "units",
        },
      ];
      saveStock(next);
      return next;
    });
  }

  function remove(id: string) {
    setStock((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveStock(next);
      return next;
    });
  }

  const lowStock = stock.filter((s) => s.qtyOnHand < s.reorderPoint);

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Materials on hand"
        subtitle={`${stock.length} tracked SKUs · ${lowStock.length} below reorder point`}
      />
      <div className="px-8 py-6 max-w-5xl space-y-4">
        {lowStock.length > 0 && (
          <div className="bg-status-at-risk-soft border border-status-at-risk/30 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle
              className="h-4 w-4 text-status-at-risk shrink-0 mt-0.5"
              strokeWidth={1.75}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-status-at-risk mb-1">
                {lowStock.length} item{lowStock.length === 1 ? "" : "s"} need reorder
              </div>
              <div className="text-xs text-text-secondary">
                {lowStock
                  .map((s) => materials.find((m) => m.id === s.materialId)?.name ?? "Unknown")
                  .join(", ")}
              </div>
            </div>
          </div>
        )}

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
                const value = (mat?.pricePerSqft ?? 0) * entry.qtyOnHand;
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-0 group hover:bg-surface-muted/30 transition-colors duration-fast"
                  >
                    <td className="px-4 py-2.5">
                      <select
                        value={entry.materialId}
                        onChange={(e) => update(entry.id, { materialId: e.target.value })}
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
                          update(entry.id, {
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
                          update(entry.id, {
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
                        onChange={(e) => update(entry.id, { unit: e.target.value })}
                        className="w-24 bg-transparent border-0 px-2 py-1 text-sm text-text-secondary rounded focus:outline-none focus:bg-surface-muted"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {formatCAD(value)}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => remove(entry.id)}
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
            onClick={add}
            className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            Add SKU
          </button>
        </div>

        <p className="text-xs text-text-tertiary px-1">
          <Package className="h-3 w-3 inline mr-1" strokeWidth={1.75} />
          Auto-decrement on job consumption arrives in M7+ alongside QuickBooks
          purchase orders.
        </p>
      </div>
    </>
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
