"use client";

import { AlertTriangle } from "lucide-react";
import type { StockEntry } from "@features/inventory/lib/inventoryStore";
import type { Material } from "@features/catalog/lib/catalogStore";

export function LowStockBanner({
  lowStock,
  materials,
}: {
  lowStock: StockEntry[];
  materials: Material[];
}) {
  if (lowStock.length === 0) return null;

  return (
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
  );
}
