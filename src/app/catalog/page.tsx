"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog, type Material, type Finish } from "@/lib/catalogStore";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";

type Tab = "materials" | "finishes";

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("materials");

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Materials & finishes"
        subtitle="Pricing source of truth for the estimator and per-job pricing."
      />
      <div className="px-8 py-6 max-w-5xl">
        <nav className="flex items-center gap-0 mb-5 border-b border-border">
          {(["materials", "finishes"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-fast capitalize",
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "materials" ? <MaterialsTable /> : <FinishesTable />}
      </div>
    </>
  );
}

function MaterialsTable() {
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
            <Row<Material>
              key={m.id}
              row={m}
              fields={[
                { key: "name", type: "text" },
                { key: "supplier", type: "text" },
                { key: "pricePerSqft", type: "number", align: "right", fmt: (v) => formatCAD(Number(v)) },
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

function FinishesTable() {
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
            <Row<Finish>
              key={f.id}
              row={f}
              fields={[
                { key: "name", type: "text" },
                { key: "coats", type: "number", align: "right" },
                { key: "pricePerSqft", type: "number", align: "right", fmt: (v) => formatCAD(Number(v)) },
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

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-text-tertiary",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

type FieldDef<T> = {
  key: keyof T;
  type: "text" | "number";
  align?: "right";
  fmt?: (v: unknown) => string;
};

function Row<T extends { id: string }>({
  row,
  fields,
  onChange,
  onRemove,
}: {
  row: T;
  fields: FieldDef<T>[];
  onChange: (patch: Partial<T>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0 group hover:bg-surface-muted/30 transition-colors duration-fast">
      {fields.map((f) => (
        <td
          key={String(f.key)}
          className={cn(
            "px-2 py-1.5",
            f.align === "right" ? "text-right tabular-nums" : ""
          )}
        >
          <input
            type={f.type}
            value={String(row[f.key] ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              const v = f.type === "number" ? parseFloat(raw) || 0 : raw;
              onChange({ [f.key]: v } as Partial<T>);
            }}
            className={cn(
              "w-full bg-transparent border-0 px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary rounded",
              "focus:outline-none focus:bg-surface-muted",
              f.align === "right" && "text-right tabular-nums"
            )}
          />
        </td>
      ))}
      <td className="px-2 py-1.5">
        <button
          onClick={onRemove}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
          aria-label="Remove row"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
