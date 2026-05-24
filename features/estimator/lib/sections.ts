// The 10 estimator categories — ordered top-to-bottom as Andrew works
// through a quote, from pre-work through deficiency cleanup. Replaces the
// older 9-section list (Materials, Hardware, CNC, Doors & Faces, Assembly,
// Finishing, Delivery, Install, GC Subcontractors).
//
// Lines whose `category` string matches a section label belong to that
// section. Anything else falls into a fallback "Other" group at the bottom.

export type SectionId =
  | "prework"
  | "casework"
  | "cnc"
  | "doors"
  | "face"
  | "finishing"
  | "assembly"
  | "delivery"
  | "install"
  | "deficiencies";

// Where a section's line cost lands on the saved Job's CostLine groupings.
// "prework" is Andrew's own time and is internal-only — excluded from the
// quoted price but kept on the Job for margin analysis.
export type SectionBucket = "materials" | "labour" | "prework";

export type SectionDef = {
  id: SectionId;
  label: string; // canonical category string + UI label
  bucket: SectionBucket;
  description?: string;
  // Pre-work, delivery, and deficiencies use bespoke structured blocks
  // instead of the freeform line-items table. Mark them so the renderer
  // knows to swap in the right component.
  layout?: "lines" | "prework" | "delivery" | "deficiencies";
  // Pre-work cost is recorded internally but excluded from quoted price.
  excludeFromQuote?: boolean;
};

export const QUOTE_SECTIONS: SectionDef[] = [
  {
    id: "prework",
    label: "Pre-work",
    bucket: "prework",
    description: "Site visits, design meetings, estimating (internal cost only — not on quote)",
    layout: "prework",
    excludeFromQuote: true,
  },
  {
    id: "casework",
    label: "Casework",
    bucket: "materials",
    description: "Cabinet box sheet goods — plywood, MDF, melamine (by whole sheets)",
    layout: "lines",
  },
  {
    id: "cnc",
    label: "CNC subcontract",
    bucket: "materials",
    description: "Toolpath sheet cutting — one flat quote per job",
    layout: "lines",
  },
  {
    id: "doors",
    label: "Door materials & profiles",
    bucket: "materials",
    description: "Maple shaker, MDF slab, walnut veneered — by sqft",
    layout: "lines",
  },
  {
    id: "face",
    label: "Face components",
    bucket: "materials",
    description: "Fillers, scribes, toekicks — CNC'd flat. Sqft feeds Finishing",
    layout: "lines",
  },
  {
    id: "finishing",
    label: "Finishing",
    bucket: "labour",
    description: "Paint / stain+clear / clear — multiple finishes per job ok",
    layout: "lines",
  },
  {
    id: "assembly",
    label: "Assembly",
    bucket: "labour",
    description: "Shop time — auto-derived from cabinet counts × per-type minutes",
    layout: "lines",
  },
  {
    id: "delivery",
    label: "Packing & delivery",
    bucket: "materials",
    description: "Gas + travel time + loading time. Distance-driven calculator",
    layout: "delivery",
  },
  {
    id: "install",
    label: "Install",
    bucket: "labour",
    description: "On-site labour — auto-derived from cabinet counts × per-type minutes",
    layout: "lines",
  },
  {
    id: "deficiencies",
    label: "Deficiencies",
    bucket: "labour",
    description: "Touch-up hours budget + contingency % on top for unknowns",
    layout: "deficiencies",
  },
];

export const SECTION_LABELS = QUOTE_SECTIONS.map((s) => s.label);

export const ALL_SECTION_IDS: SectionId[] = QUOTE_SECTIONS.map((s) => s.id);

export function findSection(idOrLabel: string): SectionDef | undefined {
  return QUOTE_SECTIONS.find(
    (s) => s.id === idOrLabel || s.label === idOrLabel,
  );
}

export function bucketForCategory(category: string): SectionBucket {
  return findSection(category)?.bucket ?? "materials";
}

// A line is excluded from the quoted (client-facing) price when its section
// is marked excludeFromQuote — currently only Pre-work. The line still
// counts toward internal cost so Andrew sees the true margin reality.
export function isLineExcludedFromQuote(category: string): boolean {
  return findSection(category)?.excludeFromQuote === true;
}

// A LineItem may carry an explicit excludeFromQuote flag (e.g. user added
// a special non-billed line). Otherwise the section's flag wins.
export function lineExcludedFromQuote(line: {
  category: string;
  excludeFromQuote?: boolean;
}): boolean {
  if (line.excludeFromQuote === true) return true;
  return isLineExcludedFromQuote(line.category);
}
