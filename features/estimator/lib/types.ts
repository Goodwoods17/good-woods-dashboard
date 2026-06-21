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

// ─── Rooms ──────────────────────────────────────────────────────────────
// Rooms act as toggleable scope units. A quote has zero or more rooms;
// each line and each cabinet entry can optionally belong to one. Disabled
// rooms exclude their contribution from the quoted total — so a client
// saying "drop the bathroom" is a one-click change, not a re-quote.

export type Room = {
  id: string;
  name: string;
  enabled: boolean;
};

export function newRoom(name: string): Room {
  return {
    id: `room_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name,
    enabled: true,
  };
}

// ─── Line item ──────────────────────────────────────────────────────────

export type LineItem = {
  id: string;
  category: string; // free-text, with suggestions ("Casework", "Doors", "Finishing"…)
  item: string; // free-text item name ("3/4 Plywood Birch")
  description?: string; // optional sub-detail ("(Assembly)", "(Phill)")
  qty: number; // finished/needed quantity
  unit: Unit;
  unitPrice: number; // $ per unit
  wastePct: number; // % extra to buy to cover machining waste (usually 0)
  markupPct: number; // per-line markup on cost
  catalogId?: string; // hook to Catalog entry (snapshots below capture state at pick-time)
  supplierSnapshot?: string; // who the catalog item said it came from when picked
  unitPriceSnapshot?: number; // what the price was when picked (catalog may have changed since)
  offerIdSnapshot?: string; // which catalog offer this line was priced from (inert seam: lets a future cart-loader group a job's lines by supplier)
  roomId?: string; // optional — assigns this line to a Room for per-room subtotals + toggle
  excludeFromQuote?: boolean; // pre-work lines: counted in internal cost, NOT in quoted price
};

export const DEFAULT_LABOUR_RATE = 85; // legacy fallback; real rates live in workspace settings
export const DEFAULT_MARKUP_PCT = 35;

// ─── Workspace labour rates ─────────────────────────────────────────────
// Three rates kept separately so each labour bucket can use its own cost
// reality. Stored in workspace settings, surfaced in /settings.

export type LabourRates = {
  designRate: number; // $/hr — pre-work (site visits, design meetings, estimating)
  shopRate: number; // $/hr — assembly, in-shop deficiencies, loading time
  installRate: number; // $/hr — install, on-site deficiencies, travel time
};

export const DEFAULT_LABOUR_RATES: LabourRates = {
  designRate: 85,
  shopRate: 85,
  installRate: 95,
};

// ─── Cabinet summary ────────────────────────────────────────────────────
// Drives auto-derived Assembly / Install / Loading hours. Each cabinet type
// stores counts and total linear feet. Optionally each row is assigned to
// a Room so we can roll up per-room.

export type CabinetCount = {
  count: number;
  linearFt: number;
  roomId?: string;
};

export type CabinetSummary = {
  base: CabinetCount;
  wall: CabinetCount;
  tall: CabinetCount;
  island: CabinetCount;
  pulls: number;
  roomLinearFt?: number; // optional override / additional room measurement
};

export type CabinetTypeId = "base" | "wall" | "tall" | "island";

export const CABINET_TYPES: CabinetTypeId[] = ["base", "wall", "tall", "island"];

export const CABINET_TYPE_LABELS: Record<CabinetTypeId, string> = {
  base: "Base",
  wall: "Wall",
  tall: "Tall / pantry",
  island: "Island",
};

export function emptyCabinetSummary(): CabinetSummary {
  return {
    base: { count: 0, linearFt: 0 },
    wall: { count: 0, linearFt: 0 },
    tall: { count: 0, linearFt: 0 },
    island: { count: 0, linearFt: 0 },
    pulls: 0,
  };
}

export function totalCabinetLinearFt(s: CabinetSummary): number {
  return s.base.linearFt + s.wall.linearFt + s.tall.linearFt + s.island.linearFt;
}

export function totalCabinetCount(s: CabinetSummary): number {
  return s.base.count + s.wall.count + s.tall.count + s.island.count;
}

// Per-cabinet-type time defaults — now the *fallback*. The live values
// the auto-derive uses come from the Catalog (`catalog_cabinet_types`,
// read via `useCatalog().cabinetTypes`), tuned by the shop's labour
// timers. EstimatorView merges those over these defaults, so a fresh DB
// (whose seed equals these numbers) behaves identically until a labour
// nudge is applied. These remain the industry-average starting points.

export const DEFAULT_ASSEMBLY_MINUTES: Record<CabinetTypeId, number> = {
  base: 60,
  wall: 45,
  tall: 90,
  island: 90,
};

export const DEFAULT_INSTALL_MINUTES: Record<CabinetTypeId, number> = {
  base: 30,
  wall: 20,
  tall: 45,
  island: 45,
};

export const DEFAULT_LOADING_MINUTES: Record<CabinetTypeId, number> = {
  base: 5,
  wall: 4,
  tall: 7,
  island: 7,
};

// ─── Pre-work fixed slots ───────────────────────────────────────────────
// Pre-work is internal-only cost tracking. Three optional slots — Andrew
// fills the ones that apply, leaves the rest blank.

export type PreWorkSlotId = "site_visit" | "design" | "estimating";

export type PreWorkSlot = {
  hours: number; // 0 = unused
  note?: string;
};

export type PreWorkState = Record<PreWorkSlotId, PreWorkSlot>;

export const PRE_WORK_SLOT_LABELS: Record<PreWorkSlotId, string> = {
  site_visit: "Site visit / measurement",
  design: "Design meetings",
  estimating: "Estimating",
};

export function emptyPreWork(): PreWorkState {
  return {
    site_visit: { hours: 0 },
    design: { hours: 0 },
    estimating: { hours: 0 },
  };
}

// ─── Delivery calculator ────────────────────────────────────────────────
// Structured rather than a freeform line — Andrew thinks in terms of
// distance, time, loading effort. Cost = gas + travel time + loading time.

export type DeliveryState = {
  miles: number; // one-way distance to client
  gasRatePerMile: number; // $/mi (workspace default, override per quote)
  travelHours: number; // round trip hours (defaults to miles × 2 / avgSpeed)
  loadMinutesPerCabinet: number; // default ~5 min per cabinet
};

export const DEFAULT_DELIVERY_DEFAULTS = {
  gasRatePerMile: 0.55, // CRA-aligned ballpark
  avgTravelSpeedMph: 30, // urban average
  loadMinutesPerCabinet: 5,
};

export function emptyDelivery(): DeliveryState {
  return {
    miles: 0,
    gasRatePerMile: DEFAULT_DELIVERY_DEFAULTS.gasRatePerMile,
    travelHours: 0,
    loadMinutesPerCabinet: DEFAULT_DELIVERY_DEFAULTS.loadMinutesPerCabinet,
  };
}

// ─── Deficiencies block ─────────────────────────────────────────────────
// Two-part: a defined hours budget for typical touch-ups, plus a
// contingency % on top of total job for true unknowns.

export type DeficienciesState = {
  hoursBudget: number; // direct labour budget for typical touch-ups
  contingencyPct: number; // % of quoted total added on top for unknowns
};

export function emptyDeficiencies(): DeficienciesState {
  return {
    hoursBudget: 0,
    contingencyPct: 0,
  };
}
