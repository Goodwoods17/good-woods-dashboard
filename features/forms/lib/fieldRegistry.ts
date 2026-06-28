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

/** Returns true when a value is a non-empty string (used by text/number/date). */
function hasValue(field: FormInstanceField): boolean {
  return typeof field.value === "string" && field.value.trim() !== "";
}

/** Returns true when a media field has a stored photo/signature path. */
function hasPhoto(field: FormInstanceField): boolean {
  return typeof field.photoUrl === "string" && field.photoUrl.trim() !== "";
}

/** Returns true when a signature records a typed signer name (audit detail). */
function hasSignerName(field: FormInstanceField): boolean {
  const name = (field.config as Record<string, unknown>)?.signerName;
  return typeof name === "string" && name.trim() !== "";
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
  // Slice 3 media types.
  photo: {
    type: "photo",
    label: "Photo",
    isLayout: false,
    implemented: true,
    // A photo is answered once an image is captured/uploaded (photoUrl set).
    isComplete: (f) => requiredOrPass(f, hasPhoto(f)),
  },
  signature: {
    type: "signature",
    label: "Signature",
    isLayout: false,
    implemented: true,
    // A signature is answered only with BOTH the PNG and the typed signer name —
    // the audit pair that makes the eventual signoff dispute-proof.
    isComplete: (f) => requiredOrPass(f, hasPhoto(f) && hasSignerName(f)),
  },
};

/** Lookup that tolerates an unknown DB `type` (forward-compat fallback). */
export function getFieldEntry(type: string): FieldRegistryEntry | undefined {
  return FIELD_REGISTRY[type as FieldType];
}

/** Every field type, for builder pickers + test exhaustiveness checks. */
export const FIELD_TYPES: FieldType[] = Object.keys(FIELD_REGISTRY) as FieldType[];

/**
 * Field-logic helpers on the registry seam (Phase C consolidation). These were
 * re-derived inline across the fill surfaces, the public portal, the template
 * editor, and the share panel — centralising them here keeps the registry the
 * single source of truth for "is this field required / answerable / shippable".
 */

/** Is this field flagged required? (`config.required === true`.) */
export function isFieldRequired(field: { config?: unknown }): boolean {
  return (field.config as Record<string, unknown> | undefined)?.required === true;
}

/** The implemented field types, in registry order — the builder's type picker list. */
export const IMPLEMENTED_TYPES: FieldType[] = FIELD_TYPES.filter(
  (t) => FIELD_REGISTRY[t].implemented
);

/**
 * Answerable fields only — drops layout types (section headings). Tolerates an
 * unknown DB `type` (kept, mirroring the forward-compat fallback) since only a
 * known layout entry is filtered out.
 */
export function answerableFields<T extends { type: string }>(fields: T[]): T[] {
  return fields.filter((f) => !getFieldEntry(f.type)?.isLayout);
}
