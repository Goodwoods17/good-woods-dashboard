// ─── Units ──────────────────────────────────────────────────────────────
// Internal codes (compact, machine-friendly) vs. UI labels (Mozaik-style,
// what Andrew already reads on his exports).

export type Unit = "ea" | "sqft" | "lf" | "bf" | "hr";

export const UNITS: Unit[] = ["ea", "sqft", "lf", "bf", "hr"];

export const UNIT_LABELS: Record<Unit, string> = {
  ea: "#",
  sqft: "SqFt",
  lf: "Ft",
  bf: "bf",
  hr: "Hrs",
};

export const UNIT_DESCRIPTIONS: Record<Unit, string> = {
  ea: "Each / count",
  sqft: "Square feet",
  lf: "Linear feet",
  bf: "Board feet (hardwoods)",
  hr: "Hours",
};

// Waste is only relevant for materials machined to size (hardwood rails &
// stiles, sheet goods cut to parts). For hours, counts, finished pieces
// it never applies. This is a soft hint for the UI — the form will still
// accept a waste% on any unit, it just defaults to hidden for these.
export function unitHasWaste(unit: Unit): boolean {
  return unit === "bf" || unit === "sqft" || unit === "lf";
}

// ─── Line item ──────────────────────────────────────────────────────────

export type LineItem = {
  id: string;
  category: string; // free-text, with suggestions ("Materials", "Doors", "Banding"…)
  item: string; // free-text item name ("3/4 Plywood Birch")
  description?: string; // optional sub-detail ("(Assembly)", "(Phill)")
  qty: number; // finished/needed quantity
  unit: Unit;
  unitPrice: number; // $ per unit
  wastePct: number; // % extra to buy to cover machining waste (usually 0)
  markupPct: number; // per-line markup on cost
  catalogId?: string; // Phase 2: hook to Catalog entry
};

export const DEFAULT_LABOUR_RATE = 85;
export const DEFAULT_MARKUP_PCT = 35;

// ─── Cabinet summary ────────────────────────────────────────────────────
// Info-only block at the bottom of the quote. Not priced. Feeds future
// metrics (cost per linear foot, assembly time by cabinet type, etc).

export type CabinetSummary = {
  base: { count: number; linearFt: number };
  wall: { count: number; linearFt: number };
  tall: { count: number; linearFt: number };
  pulls: number;
  roomLinearFt?: number; // optional override / additional room measurement
};

export function emptyCabinetSummary(): CabinetSummary {
  return {
    base: { count: 0, linearFt: 0 },
    wall: { count: 0, linearFt: 0 },
    tall: { count: 0, linearFt: 0 },
    pulls: 0,
  };
}

export function totalCabinetLinearFt(s: CabinetSummary): number {
  return s.base.linearFt + s.wall.linearFt + s.tall.linearFt;
}

export function totalCabinetCount(s: CabinetSummary): number {
  return s.base.count + s.wall.count + s.tall.count;
}
