"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useReface } from "../lib/refaceStore";
import {
  CATEGORY_COLUMN_LABEL,
  CATEGORY_ROW_LABEL,
  columnOptions,
  MATERIAL_CATEGORY_LABEL,
  MDF_FINISH_SURCHARGE,
  rowOptions,
  type MaterialCategory,
} from "../lib/newSurreyPriceBook";
import type { GrainDirection, OrderSettings, RefaceProject } from "../lib/types";
import { Field } from "@shared/components/forms/FormField";
import { cn } from "@shared/lib/utils";

const inputCls =
  "w-full text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast";

const CATEGORIES: MaterialCategory[] = ["wood", "pvc", "mdf", "acrylic", "melamine"];
const FINISH_OPTIONS = Object.keys(MDF_FINISH_SURCHARGE);

/** Project-level product spec + New Surrey price-book selectors. */
export function OrderSettingsForm({ project }: { project: RefaceProject }) {
  const { updateProject } = useReface();
  const [open, setOpen] = useState(false);
  const s = project.orderSettings;

  function set(patch: Partial<OrderSettings>) {
    updateProject(project.id, { orderSettings: { ...s, ...patch } });
  }
  function setAddOn(key: keyof OrderSettings["addOns"], value: boolean) {
    set({ addOns: { ...s.addOns, [key]: value } });
  }

  // Changing category usually invalidates row/column picks; clear them.
  function setCategory(category: MaterialCategory) {
    set({ materialCategory: category, woodSpecies: "", doorStyle: "", materialFinish: "" });
  }

  const rows = rowOptions(s.materialCategory);
  const cols = columnOptions(s.materialCategory);
  // Wood: row=species, col=style. PVC/MDF: row=style, col=finish. Acrylic/melamine: row=colour.
  const rowValue =
    s.materialCategory === "pvc" || s.materialCategory === "mdf" ? s.doorStyle : s.woodSpecies;
  const setRow = (v: string) =>
    s.materialCategory === "pvc" || s.materialCategory === "mdf"
      ? set({ doorStyle: v })
      : set({ woodSpecies: v });
  const colValue =
    s.materialCategory === "wood" || s.materialCategory === "melamine"
      ? s.doorStyle
      : s.materialFinish;
  const setCol = (v: string) =>
    s.materialCategory === "wood" || s.materialCategory === "melamine"
      ? set({ doorStyle: v })
      : set({ materialFinish: v });
  const showAcrylicNote = s.materialCategory === "acrylic";

  return (
    <div className="rounded-xl border border-border bg-surface shadow-resting overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 border-b border-border-faint bg-surface-muted/60 flex items-center justify-between"
      >
        <h3 className="font-serif text-title text-text-primary">Product spec & pricing</h3>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-text-tertiary transition-transform duration-fast",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <Field label="Material">
            <select
              value={s.materialCategory}
              onChange={(e) => setCategory(e.target.value as MaterialCategory)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MATERIAL_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={CATEGORY_ROW_LABEL[s.materialCategory]}>
              <select
                value={rowValue}
                onChange={(e) => setRow(e.target.value)}
                className={inputCls}
              >
                <option value="">Select…</option>
                {rows.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            {!showAcrylicNote && (
              <Field label={CATEGORY_COLUMN_LABEL[s.materialCategory]}>
                <select
                  value={colValue}
                  onChange={(e) => setCol(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {cols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {s.materialCategory === "mdf" && (
            <Field label="Applied finish (surcharge)">
              <select
                value={s.finish}
                onChange={(e) => set({ finish: e.target.value })}
                className={inputCls}
              >
                <option value="">None</option>
                {FINISH_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Per-sqft add-ons */}
          <div>
            <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
              Add-ons
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["hingeHoles", "Hinge holes (+$1)"],
                  ["parklane", "Parklane (+$1)"],
                  ["extraGroove", "Extra groove (+$1)"],
                  ["outsideProfileAddon", "Outside profile (+$0.50)"],
                ] as [keyof OrderSettings["addOns"], string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={s.addOns[key]}
                    onChange={(e) => setAddOn(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Header / order-form spec */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="Model no.">
              <input
                className={inputCls}
                value={s.modelNo}
                onChange={(e) => set({ modelNo: e.target.value })}
              />
            </Field>
            <Field label="Customer PO">
              <input
                className={inputCls}
                value={s.customerPO}
                onChange={(e) => set({ customerPO: e.target.value })}
              />
            </Field>
            <Field label="Stile">
              <input
                className={inputCls}
                value={s.stileSize}
                onChange={(e) => set({ stileSize: e.target.value })}
              />
            </Field>
            <Field label="Rail">
              <input
                className={inputCls}
                value={s.railSize}
                onChange={(e) => set({ railSize: e.target.value })}
              />
            </Field>
            <Field label="Inside profile">
              <input
                className={inputCls}
                value={s.insideProfile}
                onChange={(e) => set({ insideProfile: e.target.value })}
              />
            </Field>
            <Field label="Outside profile">
              <input
                className={inputCls}
                value={s.outsideProfile}
                onChange={(e) => set({ outsideProfile: e.target.value })}
              />
            </Field>
            <Field label="Panel profile">
              <input
                className={inputCls}
                value={s.panelProfile}
                onChange={(e) => set({ panelProfile: e.target.value })}
              />
            </Field>
            <Field label="Finish">
              <input
                className={inputCls}
                value={s.finish}
                onChange={(e) => set({ finish: e.target.value })}
              />
            </Field>
          </div>

          {/* Grain */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Door grain">
              <select
                value={s.doorGrain ?? ""}
                onChange={(e) => set({ doorGrain: (e.target.value || null) as GrainDirection })}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </Field>
            <Field label="Drawer grain">
              <select
                value={s.drawerGrain ?? ""}
                onChange={(e) => set({ drawerGrain: (e.target.value || null) as GrainDirection })}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </Field>
          </div>

          {/* Hinge boring */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hinge hole">
              <input
                className={inputCls}
                value={s.hingeBoring.hingeHole}
                onChange={(e) =>
                  set({ hingeBoring: { ...s.hingeBoring, hingeHole: e.target.value } })
                }
              />
            </Field>
            <Field label="Pilot hole size">
              <input
                className={inputCls}
                value={s.hingeBoring.pilotHoleSize}
                onChange={(e) =>
                  set({ hingeBoring: { ...s.hingeBoring, pilotHoleSize: e.target.value } })
                }
              />
            </Field>
          </div>

          <Field label="Shipping cost (courier, by weight)">
            <input
              className={inputCls}
              type="number"
              min={0}
              step="0.01"
              value={s.shippingCost || ""}
              onChange={(e) => set({ shippingCost: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="0.00"
            />
          </Field>
        </div>
      )}
    </div>
  );
}
