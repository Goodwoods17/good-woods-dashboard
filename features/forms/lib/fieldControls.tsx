import type { ComponentType } from "react";
import type { FieldType, FormInstanceField } from "@shared/lib/types";

/**
 * Fill-time React controls, keyed by field type. Kept in a `.tsx` sibling of the
 * pure `fieldRegistry.ts` so the registry's logic (metadata, isComplete,
 * exhaustiveness) stays JSX-free and unit-testable under the node vitest env.
 * Only UI components import this file; tests never do.
 *
 * Slice 1 wires `section` + `checkbox`. Unimplemented or unknown types have no
 * entry here; FormFillSurface renders a safe read-only fallback instead (the
 * forward-compat invariant — never crash on a future type).
 */

export type FillControlProps = {
  field: FormInstanceField;
  /** Patch the instance field's answer (checked/value/note/photoUrl). */
  onChange: (patch: Partial<FormInstanceField>) => void;
  disabled?: boolean;
};

function SectionFill({ field }: FillControlProps) {
  return (
    <div className="pt-4 pb-1">
      <h3 className="font-serif text-lg text-text-primary">{field.label}</h3>
      <div className="mt-1 h-px bg-border" />
    </div>
  );
}

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

export const FILL_CONTROLS: Partial<Record<FieldType, ComponentType<FillControlProps>>> = {
  section: SectionFill,
  checkbox: CheckboxFill,
};

export function getFillControl(type: string): ComponentType<FillControlProps> | undefined {
  return FILL_CONTROLS[type as FieldType];
}
