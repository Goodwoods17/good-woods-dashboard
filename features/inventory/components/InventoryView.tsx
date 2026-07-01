"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { PillButton } from "@shared/components/ui/PillButton";
import { formatCAD } from "@shared/lib/format";
import {
  useInventory,
  isLow,
  type StockEntry,
  type NewStockEntry,
} from "@features/inventory/lib/inventoryStore";
import { ReorderNow } from "./LowStockBanner";
import { StockRegister } from "./StockTable";
import { ItemModal } from "./ItemModal";

export function InventoryView() {
  const { stock, loading, error, addItem, updateItem, markReordered, removeItem } = useInventory();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<StockEntry | null>(null);

  const low = useMemo(() => stock.filter((s) => isLow(s) && !s.reorderedAt), [stock]);
  const onOrder = useMemo(() => stock.filter((s) => s.reorderedAt !== null), [stock]);
  const totalValue = useMemo(
    () => stock.reduce((sum, s) => sum + s.unitValue * s.qtyOnHand, 0),
    [stock]
  );

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Materials on hand"
        subtitle={`${stock.length} tracked · ${formatCAD(totalValue)} on the shelf`}
        actions={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-active"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add item
          </button>
        }
      />

      <div className="max-w-4xl space-y-4 px-4 py-6 md:px-8">
        {error && (
          <p className="rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
            {error}
          </p>
        )}

        {loading ? (
          <Skeleton />
        ) : stock.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <>
            <ReorderNow low={low} onOrder={onOrder} onReordered={markReordered} />
            <StockRegister
              stock={stock}
              onUpdate={updateItem}
              onEdit={setEditItem}
              onRemove={removeItem}
            />
          </>
        )}
      </div>

      {showAdd && (
        <ItemModal
          onSubmit={(values: NewStockEntry) => void addItem(values)}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editItem && (
        <ItemModal
          item={editItem}
          onSubmit={(values) => {
            updateItem(editItem.id, values);
          }}
          onDelete={() => void removeItem(editItem.id)}
          onClose={() => setEditItem(null)}
        />
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-16 rounded-2xl bg-surface shadow-resting" />
      <div className="h-64 rounded-2xl bg-surface shadow-resting" />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl bg-surface px-6 py-16 text-center shadow-resting">
      <h2 className="font-serif text-xl font-medium text-text-primary">No stock tracked yet</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
        Add the materials you keep on hand, set a reorder point, and this page tells you what to
        restock before a job stalls.
      </p>
      <PillButton size="md" className="mt-5 min-h-[40px]" onClick={onAdd}>
        <Plus className="h-4 w-4" strokeWidth={2} />
        Add item
      </PillButton>
    </div>
  );
}
