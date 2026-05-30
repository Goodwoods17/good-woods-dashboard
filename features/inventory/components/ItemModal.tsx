"use client";

import { useState } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { FieldStack, Field, Input } from "@shared/components/forms/FormField";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import type { NewStockEntry, StockEntry } from "@features/inventory/lib/inventoryStore";

const CONTROL =
  "w-full text-sm bg-surface border border-border rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast";

/**
 * Add or edit a stock line. Picks a material from the Catalog (snapshotting
 * unit + per-unit value), or falls back to a free-typed material name.
 */
export function ItemModal({
  item,
  onSubmit,
  onDelete,
  onClose,
}: {
  item?: StockEntry;
  onSubmit: (values: NewStockEntry) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { materials } = useCatalog();
  const editing = item !== undefined;

  const [freeText, setFreeText] = useState(editing ? item.materialId === null : false);
  const [materialId, setMaterialId] = useState(item?.materialId ?? "");
  const [materialName, setMaterialName] = useState(item?.materialName ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "units");
  const [unitValue, setUnitValue] = useState(String(item?.unitValue ?? 0));
  const [qtyOnHand, setQtyOnHand] = useState(String(item?.qtyOnHand ?? 0));
  const [reorderPoint, setReorderPoint] = useState(String(item?.reorderPoint ?? 0));

  const sorted = [...materials].sort((a, b) => a.name.localeCompare(b.name));

  function pickMaterial(id: string) {
    setMaterialId(id);
    const m = materials.find((x) => x.id === id);
    if (m) {
      setMaterialName(m.name);
      setUnit(String(m.unit));
      setUnitValue(String(m.unitPrice));
    }
  }

  const canSave = freeText ? materialName.trim().length > 0 : materialId !== "";

  function submit() {
    if (!canSave) return;
    onSubmit({
      materialId: freeText ? null : materialId,
      materialName: materialName.trim(),
      unit: unit.trim() || "units",
      unitValue: Number(unitValue) || 0,
      qtyOnHand: Number(qtyOnHand) || 0,
      reorderPoint: Number(reorderPoint) || 0,
    });
    onClose();
  }

  return (
    <Modal title={editing ? "Edit stock item" : "Add stock item"} onClose={onClose}>
      <FieldStack>
        <Field label="Material">
          {freeText ? (
            <Input
              value={materialName}
              onChange={setMaterialName}
              placeholder="e.g. Edge banding, white"
            />
          ) : (
            <select
              value={materialId}
              onChange={(e) => pickMaterial(e.target.value)}
              className={CONTROL}
            >
              <option value="">Pick from catalog…</option>
              {sorted.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setFreeText((v) => !v)}
            className="mt-1.5 text-xs text-text-tertiary underline-offset-2 hover:text-accent hover:underline"
          >
            {freeText ? "Pick from catalog instead" : "Not in the catalog? Type it"}
          </button>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="On hand">
            <input
              type="number"
              value={qtyOnHand}
              onChange={(e) => setQtyOnHand(e.target.value)}
              className={`${CONTROL} text-right tabular-nums`}
            />
          </Field>
          <Field label="Reorder at">
            <input
              type="number"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              className={`${CONTROL} text-right tabular-nums`}
            />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={setUnit} placeholder="sheets" />
          </Field>
          <Field label="Value each ($)">
            <input
              type="number"
              value={unitValue}
              onChange={(e) => setUnitValue(e.target.value)}
              className={`${CONTROL} text-right tabular-nums`}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {editing && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-status-blocked transition-colors duration-fast hover:bg-status-blocked-soft"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-active disabled:cursor-not-allowed disabled:opacity-40"
            >
              {editing ? "Save" : "Add item"}
            </button>
          </div>
        </div>
      </FieldStack>
    </Modal>
  );
}
