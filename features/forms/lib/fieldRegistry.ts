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
 * JobDetail change. Slice 1 wires `section` + `checkbox` (`implemented: true`);
 * the rest are scaffold entries so the registry is exhaustive over FieldType
 * today. An unimplemented or unknown type renders a safe read-only fallback.
 */

export type FieldRegistryEntry = {
  type: FieldType;
  /** Human label for the builder's field-type picker (later slices). */
  label: string;
  /** A section is a heading/divider, not an answerable field. */
  isLayout: boolean;
  /** Wired in this slice? Unimplemented types render the read-only fallback. */
  implemented: boolean;
  /** Completion gate: is this field considered answered? Layout fields are always complete. */
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
  // Scaffold entries — wired in later slices.
  short_text: scaffold("short_text", "Short text"),
  long_text: scaffold("long_text", "Long text"),
  number: scaffold("number", "Number"),
  yes_no: scaffold("yes_no", "Yes / No"),
  dropdown: scaffold("dropdown", "Dropdown"),
  date: scaffold("date", "Date"),
  photo: scaffold("photo", "Photo"),
  signature: scaffold("signature", "Signature"),
};

/** Lookup that tolerates an unknown DB `type` (forward-compat fallback). */
export function getFieldEntry(type: string): FieldRegistryEntry | undefined {
  return FIELD_REGISTRY[type as FieldType];
}

/** Every field type, for builder pickers + test exhaustiveness checks. */
export const FIELD_TYPES: FieldType[] = Object.keys(FIELD_REGISTRY) as FieldType[];
