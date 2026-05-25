"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useCatalog, type Material } from "@features/catalog/lib/catalogStore";
import { getStaleness } from "@features/catalog/lib/priceHistory";
import { QUOTE_SECTIONS, type SectionId } from "@features/estimator/lib/sections";
import {
  UNITS,
  UNIT_LABELS,
  type Unit,
} from "@features/estimator/lib/types";

export function MaterialsTable() {
  const { materials, addMaterial, updateMaterial, removeMaterial } =
    useCatalog();

  const grouped = useMemo(() => {
    const out: Partial<Record<SectionId, Material[]>> = {};
    for (const m of materials) {
      if (!out[m.section]) out[m.section] = [];
      out[m.section]!.push(m);
    }
    return out as Record<SectionId, Material[]>;
  }, [materials]);

  return (
    <div className="space-y-4">
      {QUOTE_SECTIONS.filter(
        (s) => s.layout !== "prework" && s.layout !== "deficiencies",
      ).map((section) => {
        const rows = grouped[section.id] ?? [];
        return (
          <div
            key={section.id}
            className="bg-surface border border-border rounded-lg overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-border bg-surface-muted flex items-center justify-between">
              <div>
                <h3 className="text-xs uppercase tracking-[0.08em] font-semibold text-text-primary">
                  {section.label}
                </h3>
                {section.description && (
                  <p className="text-caption text-text-tertiary mt-0.5">
                    {section.description}
                  </p>
                )}
              </div>
              <span className="text-caption text-text-tertiary">
                {rows.length} item{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/30 text-micro uppercase tracking-wider text-text-tertiary">
                  <Th>Name</Th>
                  <Th>Supplier</Th>
                  <Th align="center">Unit</Th>
                  <Th align="right">Unit price</Th>
                  <Th align="right">Waste %</Th>
                  <Th align="right">Markup %</Th>
                  <Th>Updated</Th>
                  <Th>Notes</Th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <MaterialRow
                    key={m.id}
                    material={m}
                    onChange={(p) => updateMaterial(m.id, p)}
                    onRemove={() => removeMaterial(m.id)}
                  />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-3 text-center text-xs text-text-tertiary italic"
                    >
                      No items in this section yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <button
              onClick={() =>
                addMaterial({
                  name: "",
                  supplier: "",
                  unit: section.id === "casework" ? "ea" : "sqft",
                  unitPrice: 0,
                  section: section.id,
                  defaultWastePct: 0,
                  defaultMarkupPct: 35,
                })
              }
              className="w-full px-5 py-2 flex items-center gap-2 text-xs text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border-t border-border"
            >
              <Plus className="h-3 w-3" strokeWidth={1.75} />
              Add item to {section.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MaterialRow({
  material,
  onChange,
  onRemove,
}: {
  material: Material;
  onChange: (patch: Partial<Material>) => void;
  onRemove: () => void;
}) {
  const stale = getStaleness(material.priceUpdatedAt);
  return (
    <tr className="border-b border-border last:border-0 group hover:bg-surface-muted/30 transition-colors duration-fast">
      <Td>
        <TextInput
          value={material.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="Item name"
        />
      </Td>
      <Td>
        <TextInput
          value={material.supplier}
          onChange={(v) => onChange({ supplier: v })}
          placeholder="Supplier"
        />
      </Td>
      <Td align="center">
        <select
          value={material.unit}
          onChange={(e) => onChange({ unit: e.target.value as Unit })}
          className="text-sm bg-transparent border-0 px-1 py-1 focus:outline-none focus:bg-surface-muted focus:rounded"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </Td>
      <Td align="right">
        <NumberInput
          value={material.unitPrice}
          step="0.01"
          onChange={(v) => onChange({ unitPrice: v })}
          fmt={(v) => formatCAD(v)}
        />
      </Td>
      <Td align="right">
        <NumberInput
          value={material.defaultWastePct ?? 0}
          step="1"
          onChange={(v) => onChange({ defaultWastePct: v })}
        />
      </Td>
      <Td align="right">
        <NumberInput
          value={material.defaultMarkupPct ?? 35}
          step="1"
          onChange={(v) => onChange({ defaultMarkupPct: v })}
        />
      </Td>
      <Td>
        <StaleChip chip={stale} />
      </Td>
      <Td>
        <TextInput
          value={material.notes ?? ""}
          onChange={(v) => onChange({ notes: v })}
          placeholder="(optional notes)"
        />
      </Td>
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

function StaleChip({
  chip,
}: {
  chip: { level: "fresh" | "ageing" | "stale"; label: string };
}) {
  const tone =
    chip.level === "fresh"
      ? "bg-status-ontrack/10 text-status-success border-status-success/40"
      : chip.level === "ageing"
        ? "bg-status-watch/10 text-status-watch border-status-watch/40"
        : "bg-status-blocked/10 text-status-blocked border-status-blocked/40";
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full border text-micro tabular-nums",
        tone,
      )}
    >
      {chip.label}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right" | "center";
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 font-semibold",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-2 py-1.5",
        align === "right"
          ? "text-right tabular-nums"
          : align === "center"
            ? "text-center"
            : "",
      )}
    >
      {children}
    </td>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary rounded focus:outline-none focus:bg-surface-muted"
    />
  );
}

function NumberInput({
  value,
  onChange,
  step,
  fmt,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
  fmt?: (n: number) => string;
}) {
  const [editing, setEditing] = useState<boolean>(false);
  return (
    <input
      type={editing ? "number" : "text"}
      value={editing ? value : fmt ? fmt(value) : String(value)}
      step={step ?? "0.01"}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full bg-transparent border-0 px-2 py-1 text-sm text-right tabular-nums text-text-primary rounded focus:outline-none focus:bg-surface-muted"
    />
  );
}

