"use client";

import { Plus } from "lucide-react";
import { useCatalog, type Finish } from "@features/catalog/lib/catalogStore";
import { formatCAD } from "@shared/lib/format";
import { CrudRow, Th } from "./CrudTable";

export function FinishesTable() {
  const { finishes, addFinish, updateFinish, removeFinish } = useCatalog();

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <Th>Name</Th>
            <Th align="right">Coats</Th>
            <Th align="right">Price / sqft</Th>
            <Th>Notes</Th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {finishes.map((f) => (
            <CrudRow<Finish>
              key={f.id}
              row={f}
              fields={[
                { key: "name", type: "text" },
                { key: "coats", type: "number", align: "right" },
                {
                  key: "pricePerSqft",
                  type: "number",
                  align: "right",
                  fmt: (v) => formatCAD(Number(v)),
                },
                { key: "notes", type: "text" },
              ]}
              onChange={(p) => updateFinish(f.id, p)}
              onRemove={() => removeFinish(f.id)}
            />
          ))}
        </tbody>
      </table>
      <button
        onClick={() => addFinish({ name: "", coats: 2, pricePerSqft: 0 })}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-sm text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Add finish
      </button>
    </div>
  );
}
