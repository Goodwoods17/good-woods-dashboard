"use client";

import type { ComponentType } from "react";
import type { FieldType, FormInstanceField } from "@shared/lib/types";

/**
 * Fill-time React controls, keyed by field type. Kept in a `.tsx` sibling of the
 * pure `fieldRegistry.ts` so the registry's logic (metadata, isComplete,
 * exhaustiveness) stays JSX-free and unit-testable under the node vitest env.
 * Only UI components import this file; tests never do.
 *
 * Slice 1 wires `section` + `checkbox`. Slice 2 adds short_text, long_text,
 * number, yes_no, dropdown, date. Unimplemented or unknown types have no entry
 * here; FormFillSurface renders a safe read-only fallback instead.
 */

export type FillControlProps = {
  field: FormInstanceField;
  /** Patch the instance field's answer (checked/value/note/photoUrl). */
  onChange: (patch: Partial<FormInstanceField>) => void;
  disabled?: boolean;
};

// ─── Shared input style ────────────────────────────────────────────────────
const inputCls =
  "w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 " +
  "placeholder:text-text-tertiary focus:outline-none focus:border-border-strong " +
  "focus:ring-2 focus:ring-accent-soft transition-colors duration-fast " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// ─── Section ───────────────────────────────────────────────────────────────
function SectionFill({ field }: FillControlProps) {
  return (
    <div className="pt-4 pb-1">
      <h3 className="font-serif text-lg text-text-primary">{field.label}</h3>
      <div className="mt-1 h-px bg-border" />
    </div>
  );
}

// ─── Checkbox ──────────────────────────────────────────────────────────────
function CheckboxFill({ field, onChange, disabled }: FillControlProps) {
  const checked = field.checked === true;
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1">
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-border accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange({ checked: e.target.checked })}
      />
      <span className="text-sm text-text-primary">{field.label}</span>
    </label>
  );
}

// ─── Short text ────────────────────────────────────────────────────────────
function ShortTextFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <input
        type="text"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={(field.config as Record<string, unknown>)?.placeholder as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Long text ─────────────────────────────────────────────────────────────
function LongTextFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <textarea
        className={inputCls + " resize-none"}
        rows={3}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={(field.config as Record<string, unknown>)?.placeholder as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Number ────────────────────────────────────────────────────────────────
function NumberFill({ field, onChange, disabled }: FillControlProps) {
  const cfg = field.config as Record<string, unknown>;
  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <input
        type="number"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        placeholder={cfg?.placeholder as string | undefined}
        min={cfg?.min as string | undefined}
        max={cfg?.max as string | undefined}
        step={cfg?.step as string | undefined}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}

// ─── Yes / No ──────────────────────────────────────────────────────────────
function YesNoFill({ field, onChange, disabled }: FillControlProps) {
  const current = field.value as "yes" | "no" | null;
  return (
    <div className="py-1">
      <span className="block text-sm text-text-primary mb-2">{field.label}</span>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ value: current === opt ? null : opt })}
            className={
              "min-w-[60px] rounded-full px-4 py-1.5 text-sm font-medium border transition-colors duration-fast " +
              (current === opt
                ? "bg-ink-pill text-white border-ink-pill"
                : "bg-surface-muted text-text-secondary border-border hover:border-border-strong disabled:opacity-50")
            }
          >
            {opt === "yes" ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dropdown ──────────────────────────────────────────────────────────────
function DropdownFill({ field, onChange, disabled }: FillControlProps) {
  const cfg = field.config as Record<string, unknown>;
  const options = (cfg?.options as string[] | undefined) ?? [];
  const current = typeof field.value === "string" ? field.value : "";
  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <select
        className={inputCls}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange({ value: e.target.value || null })}
      >
        <option value="">— select —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Date ──────────────────────────────────────────────────────────────────
function DateFill({ field, onChange, disabled }: FillControlProps) {
  return (
    <div className="py-1">
      <label className="block text-sm text-text-primary mb-1">{field.label}</label>
      <input
        type="date"
        className={inputCls}
        value={typeof field.value === "string" ? field.value : ""}
        disabled={disabled}
        onChange={(e) => onChange({ value: e.target.value || null })}
      />
    </div>
  );
}

export const FILL_CONTROLS: Partial<Record<FieldType, ComponentType<FillControlProps>>> = {
  section: SectionFill,
  checkbox: CheckboxFill,
  short_text: ShortTextFill,
  long_text: LongTextFill,
  number: NumberFill,
  yes_no: YesNoFill,
  dropdown: DropdownFill,
  date: DateFill,
};

export function getFillControl(type: string): ComponentType<FillControlProps> | undefined {
  return FILL_CONTROLS[type as FieldType];
}
