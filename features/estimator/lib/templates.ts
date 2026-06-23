import type { SectionId } from "./sections";
import { ALL_SECTION_IDS } from "./sections";

// Estimate templates control which of the 10 sections show on a quote.
// Not every job uses every section — reface jobs skip casework, install-only
// jobs skip everything but delivery + install.
//
// Built-in templates are hard-coded here. Custom templates (saved by the
// user) live alongside in localStorage / Supabase under the same shape.

export type EstimateTemplate = {
  id: string;
  name: string;
  description?: string;
  activeSections: SectionId[];
  defaultOverheadPct?: number;
  defaultMarkupPct?: number;
  // The unified Job template (ADR 0012): the set of labour cost codes this
  // job type budgets against. String keys into the canonical catalog
  // (`@features/job-costing/lib/costCodes`). The estimator's "Labour cost
  // codes" panel loads these and the cabinet counts fill their quantities;
  // Save-as-Job freezes them into job_cost_budgets. Optional for back-compat
  // (a template without a set falls back to the full catalog).
  costCodeSet?: string[];
  isBuiltIn: boolean;
};

// Canonical code keys, duplicated here as a stable string contract so the
// estimator template doesn't take a hard dependency on @features/job-costing.
// Keep in lockstep with CANONICAL_COST_CODES (costCodes.ts owns the truth).
const ASM = ["ASM-BASE", "ASM-WALL", "ASM-TALL", "ASM-ISLAND"];
const INST = ["INST-BASE", "INST-WALL", "INST-TALL", "INST-ISLAND"];
// Component install/assembly codes (ADR 0012 grill) — fed by the Mozaik import's
// # inserts / # rollouts / # pulls / # doors counts. A code only budgets if it's in
// the active template's set, so the templates that install components must list them.
const COMPONENT = ["INST-INSERT", "INST-ROLLOUT", "HW-PULL", "FIT-DOOR"];
const FULL_BUILD_CODES = ["DSN", "CUT-SHEET", ...ASM, "FIN-SPRAY", "DEL-LOAD", ...INST, ...COMPONENT];

export const FULL_BUILD_ID = "tpl_full_build";
export const REFACE_ID = "tpl_reface";
export const INSTALL_ONLY_ID = "tpl_install_only";
export const DESIGN_ONLY_ID = "tpl_design_only";
export const SUB_FINISHING_ID = "tpl_sub_finishing";

export const BUILT_IN_TEMPLATES: EstimateTemplate[] = [
  {
    id: FULL_BUILD_ID,
    name: "Full custom build",
    description: "Every section — pre-work through deficiencies. The default.",
    activeSections: ALL_SECTION_IDS,
    costCodeSet: FULL_BUILD_CODES,
    isBuiltIn: true,
  },
  {
    id: REFACE_ID,
    name: "Refacing",
    description: "Replace doors + visible faces. No new casework or assembly.",
    activeSections: [
      "prework",
      "doors",
      "face",
      "finishing",
      "delivery",
      "install",
      "deficiencies",
    ],
    costCodeSet: ["FIN-SPRAY", "DEL-LOAD", ...INST, "FIT-DOOR", "HW-PULL"],
    isBuiltIn: true,
  },
  {
    id: INSTALL_ONLY_ID,
    name: "Install only",
    description: "Sub-out install service. Delivery + install + touch-ups.",
    activeSections: ["prework", "delivery", "install", "deficiencies"],
    costCodeSet: ["DEL-LOAD", ...INST, "INST-INSERT", "INST-ROLLOUT", "HW-PULL"],
    isBuiltIn: true,
  },
  {
    id: DESIGN_ONLY_ID,
    name: "Design / measure only",
    description: "Site visit + design meetings. No build.",
    activeSections: ["prework"],
    costCodeSet: ["DSN"],
    isBuiltIn: true,
  },
  {
    id: SUB_FINISHING_ID,
    name: "Sub finishing",
    description: "Finishing-only sub-out. Spray work for another shop.",
    activeSections: ["prework", "finishing", "delivery"],
    costCodeSet: ["FIN-SPRAY", "DEL-LOAD"],
    isBuiltIn: true,
  },
];

export function findTemplate(
  id: string,
  custom: EstimateTemplate[] = [],
): EstimateTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? custom.find((t) => t.id === id);
}

export function defaultTemplate(): EstimateTemplate {
  return BUILT_IN_TEMPLATES[0];
}

export function isSectionActive(
  template: EstimateTemplate,
  sectionId: SectionId,
): boolean {
  return template.activeSections.includes(sectionId);
}

// Persist custom templates in localStorage for now. Schema is forward-only.
const KEY = "gw_estimate_templates_v1";

export function loadCustomTemplates(): EstimateTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as EstimateTemplate[];
  } catch {
    return [];
  }
}

export function saveCustomTemplates(templates: EstimateTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(templates));
  } catch {
    /* silent */
  }
}
