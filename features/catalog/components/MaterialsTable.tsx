"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useCatalog, type Material } from "@features/catalog/lib/catalogStore";
import { QUOTE_SECTIONS, type SectionId } from "@features/estimator/lib/sections";
import { UNITS, UNIT_LABELS, type Unit } from "@features/estimator/lib/types";
import { AutoText, NumCell, StaleChip } from "./cells";

const LINE_SECTIONS = QUOTE_SECTIONS.filter((s) => s.layout === "lines");

export function MaterialsTable() {
  const { materials, addMaterial, updateMaterial, removeMaterial } = useCatalog();
  const isMobile = useIsMobile();

  const grouped = useMemo(() => {
    const out: Partial<Record<SectionId, Material[]>> = {};
    for (const m of materials) (out[m.section] ??= []).push(m);
    return out;
  }, [materials]);

  return (
    <div className="space-y-4">
      {LINE_SECTIONS.map((section) => {
        const rows = grouped[section.id] ?? [];
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-2xl bg-surface shadow-resting"
          >
            <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
              <div className="min-w-0">
                <h3 className="font-serif text-title font-medium text-text-primary">
                  {section.label}
                </h3>
                {section.description && (
                  <p className="mt-0.5 text-xs text-text-tertiary">{section.description}</p>
                )}
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-tertiary">
                {rows.length}
              </span>
            </header>

            {rows.length > 0 &&
              (isMobile ? (
                <div className="space-y-2 px-3 pb-2">
                  {rows.map((m) => (
                    <MaterialCard
                      key={m.id}
                      material={m}
                      onChange={(p) => updateMaterial(m.id, p)}
                      onRemove={() => removeMaterial(m.id)}
                    />
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left align-bottom text-label uppercase text-text-tertiary">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Supplier</th>
                      <th className="px-3 py-1.5 text-center font-medium">Unit</th>
                      <th className="px-3 py-1.5 text-right font-medium">Price</th>
                      <th className="px-3 py-1.5 text-right font-medium">Waste%</th>
                      <th className="px-3 py-1.5 text-right font-medium">Markup%</th>
                      <th className="px-3 py-1.5 font-medium">Notes</th>
                      <th className="w-10" />
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
                  </tbody>
                </table>
              ))}

            <button
              type="button"
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
              className="flex w-full items-center gap-2 border-t border-border-faint px-4 py-2.5 text-xs text-text-tertiary transition-colors duration-fast hover:bg-accent-soft/30 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add to {section.label}
            </button>
          </section>
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
  return (
    <tr className="group border-t border-border-faint align-top even:bg-surface-muted/20 hover:bg-surface-muted/40">
      <td className="max-w-[16rem] px-3 py-1.5">
        <AutoText
          value={material.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="Item name"
        />
      </td>
      <td className="max-w-[10rem] px-3 py-1.5">
        <AutoText
          value={material.supplier}
          onChange={(v) => onChange({ supplier: v })}
          placeholder="Supplier"
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <select
          value={material.unit}
          onChange={(e) => onChange({ unit: e.target.value as Unit })}
          className="rounded-md bg-transparent px-1 py-1 text-sm focus:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumCell
          value={material.unitPrice}
          onChange={(v) => onChange({ unitPrice: v })}
          fmt={(v) => formatCAD(v)}
        />
        <div className="pr-2 text-right">
          <StaleChip iso={material.priceUpdatedAt} />
        </div>
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumCell
          value={material.defaultWastePct ?? 0}
          step="1"
          onChange={(v) => onChange({ defaultWastePct: v })}
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <NumCell
          value={material.defaultMarkupPct ?? 35}
          step="1"
          onChange={(v) => onChange({ defaultMarkupPct: v })}
        />
      </td>
      <td className="max-w-[14rem] px-3 py-1.5">
        <AutoText
          value={material.notes ?? ""}
          onChange={(v) => onChange({ notes: v })}
          placeholder="Optional"
          className="text-text-secondary"
        />
      </td>
      <td className="px-2 py-1.5 align-middle">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${material.name || "item"}`}
          className="grid h-8 w-8 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </td>
    </tr>
  );
}

function MaterialCard({
  material,
  onChange,
  onRemove,
}: {
  material: Material;
  onChange: (patch: Partial<Material>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-muted/40 p-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <AutoText
            value={material.name}
            onChange={(v) => onChange({ name: v })}
            placeholder="Item name"
            className="font-medium"
          />
          <AutoText
            value={material.supplier}
            onChange={(v) => onChange({ supplier: v })}
            placeholder="Supplier"
            className="text-text-secondary"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove item"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Labeled label="Unit">
          <select
            value={material.unit}
            onChange={(e) => onChange({ unit: e.target.value as Unit })}
            className="w-full bg-transparent text-sm focus:outline-none"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Price">
          <NumCell
            value={material.unitPrice}
            onChange={(v) => onChange({ unitPrice: v })}
            fmt={(v) => formatCAD(v)}
            className="text-left"
          />
        </Labeled>
        <Labeled label="Waste %">
          <NumCell
            value={material.defaultWastePct ?? 0}
            step="1"
            onChange={(v) => onChange({ defaultWastePct: v })}
            className="text-left"
          />
        </Labeled>
        <Labeled label="Markup %">
          <NumCell
            value={material.defaultMarkupPct ?? 35}
            step="1"
            onChange={(v) => onChange({ defaultMarkupPct: v })}
            className="text-left"
          />
        </Labeled>
      </div>
      <div className="mt-2">
        <StaleChip iso={material.priceUpdatedAt} />
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-lg bg-surface px-2.5 py-1.5">
      <span className="block text-micro uppercase tracking-wider text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}
