import type { FieldType, FormInstanceField } from "@shared/lib/types";

/**
 * Field-type registry — the spine of the form builder (issue #32 plan).
 *
 * One pure (JSX-free) entry per FieldType, keyed by the type string. Each entry
 * carries metadata + a completion gate. The fill-time React controls live in the
 * sibling `fieldControls.tsx`; this file stays pure so its exhaustiveness and
 * gating logic are unit-testable under the node vitest env.
 *
 * Adding a field type later = add the string to the FieldType union + one entry
 * here + one control in fieldControls.tsx. No migration, no store change, no
 * JobDetail change. Slice 2 wires the 6 non-media types (short_text, long_text,
 * number, yes_no, dropdown, date). An unimplemented or unknown type renders a
 * safe read-only fallback.
 */

export type FieldRegistryEntry = {
  type: FieldType;
  /** Human label for the builder's field-type picker. */
  label: string;
  /** A section is a heading/divider, not an answerable field. */
  isLayout: boolean;
  /** Wired in this slice? Unimplemented types render the read-only fallback. */
  implemented: boolean;
  /** Completion gate: is this field considered answered? Layout fields are always complete.
   *  When config.required is absent/false, non-answerable fields pass even if blank. */
  isComplete: (field: FormInstanceField) => boolean;
};

function scaffold(type: FieldType, label: string, isLayout = false): FieldRegistryEntry {
  return {
    type,
    label,
    isLayout,
    implemented: false,
    isComplete: () => true, // unimplemented types never block completion in v1
  };
}

/** Returns true when a value is a non-empty string (used by text/number/date). */
function hasValue(field: FormInstanceField): boolean {
  return typeof field.value === "string" && field.value.trim() !== "";
}

/** If config.required is set, an empty answer blocks completion. Otherwise pass. */
function requiredOrPass(field: FormInstanceField, filled: boolean): boolean {
  const isRequired = (field.config as Record<string, unknown>)?.required === true;
  return isRequired ? filled : true;
}

export const FIELD_REGISTRY: Record<FieldType, FieldRegistryEntry> = {
  section: {
    type: "section",
    label: "Section heading",
    isLayout: true,
    implemented: true,
    isComplete: () => true,
  },
  checkbox: {
    type: "checkbox",
    label: "Checkbox",
    isLayout: false,
    implemented: true,
    isComplete: (f) => f.checked === true,
  },
  short_text: {
    type: "short_text",
    label: "Short text",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, hasValue(f)),
  },
  long_text: {
    type: "long_text",
    label: "Long text",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, hasValue(f)),
  },
  number: {
    type: "number",
    label: "Number",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, hasValue(f)),
  },
  yes_no: {
    type: "yes_no",
    label: "Yes / No",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, f.value === "yes" || f.value === "no"),
  },
  dropdown: {
    type: "dropdown",
    label: "Dropdown",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, hasValue(f)),
  },
  date: {
    type: "date",
    label: "Date",
    isLayout: false,
    implemented: true,
    isComplete: (f) => requiredOrPass(f, hasValue(f)),
  },
  // Slice 3 types — scaffold, wired later.
  photo: scaffold("photo", "Photo"),
  signature: scaffold("signature", "Signature"),
};

/** Lookup that tolerates an unknown DB `type` (forward-compat fallback). */
export function getFieldEntry(type: string): FieldRegistryEntry | undefined {
  return FIELD_REGISTRY[type as FieldType];
}

/** Every field type, for builder pickers + test exhaustiveness checks. */
export const FIELD_TYPES: FieldType[] = Object.keys(FIELD_REGISTRY) as FieldType[];
