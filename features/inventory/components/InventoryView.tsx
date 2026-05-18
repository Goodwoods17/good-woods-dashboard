"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import {
  loadStock,
  saveStock,
  newStockId,
  SEED_STOCK,
  type StockEntry,
} from "@features/inventory/lib/inventoryStore";
import { StockTable } from "./StockTable";
import { LowStockBanner } from "./LowStockBanner";

export function InventoryView() {
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
          id: newStockId(),
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
        <LowStockBanner lowStock={lowStock} materials={materials} />
        <StockTable
          stock={stock}
          materials={materials}
          onUpdate={update}
          onAdd={add}
          onRemove={remove}
        />
        <p className="text-xs text-text-tertiary px-1">
          <Package className="h-3 w-3 inline mr-1" strokeWidth={1.75} />
          Auto-decrement on job consumption arrives in M7+ alongside QuickBooks
          purchase orders.
        </p>
      </div>
    </>
  );
}
