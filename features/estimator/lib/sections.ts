// Fixed sections that structure every quote. Categories on a LineItem
// match against these by label string. Lines whose category doesn't
// match a section show in a fallback "Other" group at the bottom.

export type SectionId =
  | "materials"
  | "hardware"
  | "cnc"
  | "doors"
  | "assembly"
  | "finishing"
  | "delivery"
  | "install"
  | "gc";

export type SectionDef = {
  id: SectionId;
  label: string; // canonical category string + UI label
  bucket: "materials" | "labour"; // for saved-Job CostLine grouping
  toggleable?: boolean; // GC subcontractors can be turned off per quote
  description?: string; // hint shown next to the section header
};

export const QUOTE_SECTIONS: SectionDef[] = [
  {
    id: "materials",
    label: "Materials",
    bucket: "materials",
    description: "Sheet goods, hardwoods, banding",
  },
  {
    id: "hardware",
    label: "Hardware",
    bucket: "materials",
    description: "Hinges, guides, legs, fasteners, pulls",
  },
  {
    id: "cnc",
    label: "CNC",
    bucket: "labour",
    description: "Machining time — in-house or Toolpath subcontract",
  },
  {
    id: "doors",
    label: "Doors & Faces",
    bucket: "materials",
    description: "Doors from supplier + CNC'd fillers / scribes",
  },
  {
    id: "assembly",
    label: "Assembly",
    bucket: "labour",
    description: "In-house assembly labour",
  },
  {
    id: "finishing",
    label: "Finishing",
    bucket: "labour",
    description: "In-house spray finish ($ / SqFt)",
  },
  {
    id: "delivery",
    label: "Delivery",
    bucket: "materials",
    description: "Trucking to site",
  },
  {
    id: "install",
    label: "Install",
    bucket: "labour",
    description: "On-site install labour at shop rate",
  },
  {
    id: "gc",
    label: "GC Subcontractors",
    bucket: "materials",
    toggleable: true,
    description: "Electricians, plumbers, painters when we manage the project",
  },
];

export const SECTION_LABELS = QUOTE_SECTIONS.map((s) => s.label);

export function findSection(label: string): SectionDef | undefined {
  return QUOTE_SECTIONS.find((s) => s.label === label);
}

export function bucketForCategory(category: string): "materials" | "labour" {
  return findSection(category)?.bucket ?? "materials";
}

// A line is "disabled" when its category is in a toggleable section that's
// currently turned off. Disabled lines render greyed-out and are excluded
// from totals.
export type SectionToggles = Partial<Record<SectionId, boolean>>;

export function isLineDisabled(
  category: string,
  toggles: SectionToggles
): boolean {
  const sec = findSection(category);
  if (!sec?.toggleable) return false;
  return !toggles[sec.id];
}
