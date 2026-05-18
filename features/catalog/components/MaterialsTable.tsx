"use client";

import { Plus } from "lucide-react";
import { useCatalog, type Material } from "@features/catalog/lib/catalogStore";
import { formatCAD } from "@shared/lib/format";
import { CrudRow, Th } from "./CrudTable";

export function MaterialsTable() {
  const { materials, addMaterial, updateMaterial, removeMaterial } = useCatalog();

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <Th>Name</Th>
            <Th>Supplier</Th>
            <Th align="right">Price / sqft</Th>
            <Th>Notes</Th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <CrudRow<Material>
              key={m.id}
              row={m}
              fields={[
                { key: "name", type: "text" },
                { key: "supplier", type: "text" },
                {
                  key: "pricePerSqft",
                  type: "number",
                  align: "right",
                  fmt: (v) => formatCAD(Number(v)),
                },
                { key: "notes", type: "text" },
              ]}
              onChange={(p) => updateMaterial(m.id, p)}
              onRemove={() => removeMaterial(m.id)}
            />
          ))}
        </tbody>
      </table>
      <button
        onClick={() => addMaterial({ name: "", supplier: "", pricePerSqft: 0 })}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Add material
      </button>
    </div>
  );
}
