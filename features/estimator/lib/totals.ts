import type {
  LineItem,
  Room,
  CabinetSummary,
  CabinetTypeId,
  DeliveryState,
  DeficienciesState,
  LabourRates,
  PreWorkState,
  PreWorkSlotId,
} from "./types";
import { CABINET_TYPES } from "./types";
import { PRE_WORK_SLOT_LABELS } from "./types";
import { bucketForCategory, lineExcludedFromQuote } from "./sections";
import type { SectionBucket } from "./sections";

export type LineSubtotal = {
  id: string;
  buyingQty: number; // qty × (1 + waste%)
  cost: number; // buyingQty × unitPrice
  markupAmount: number; // cost × markup%
  price: number; // cost + markupAmount
  bucket: SectionBucket;
  excludedFromQuote: boolean; // pre-work + any line flagged excludeFromQuote
  roomId?: string;
  disabledByRoom: boolean; // line's room is toggled off
};

export type EstimateTotals = {
  lineSubtotals: LineSubtotal[];
  costs: {
    materials: number; // line costs bucketed as "materials" (incl. enabled rooms only)
    labour: number; // line costs bucketed as "labour"
    prework: number; // internal-only pre-work cost (NOT in quoted price)
    direct: number; // materials + labour (excludes prework)
  };
  markupTotal: number; // sum of per-line markupAmount (enabled, non-prework lines)
  overhead: number; // direct × overheadPct
  contingency: number; // contingencyPct × (quoted total before contingency)
  quoted: number; // sum of enabled line prices + overhead + contingency
  internalCost: number; // direct + prework + overhead (true cost reality)
  totalCost: number; // direct + overhead (what the quote pays for)
  effectiveMarginPct: number; // (quoted - totalCost) / quoted × 100
  perSection: Record<string, { count: number; cost: number; price: number }>;
  perRoom: Record<string, { cost: number; price: number; lineCount: number }>;
};

export type ComputeTotalsOptions = {
  overheadPct: number;
  rooms?: Room[];
  contingencyPct?: number;
};

// Pricing model recap (see features/estimator/CLAUDE.md):
//   buyingQty = qty × (1 + waste%/100)
//   lineCost  = buyingQty × unitPrice
//   linePrice = lineCost × (1 + markup%/100)
//   quoted    = Σ(linePrice of enabled, non-prework lines) + overhead + contingency
//   internalCost = direct + prework + overhead + contingency (the true cost
//                  reality if the unknown labour materialises)
//   totalCost = direct + overhead (firm cost — what you definitely owe)
//   effectiveMarginPct = (quoted - totalCost - contingency) / quoted × 100
//                  i.e. contingency is treated as expected labour, so it
//                  doesn't inflate the margin number Andrew uses to bid.
//
// Rooms: lines whose roomId points at a disabled room contribute nothing.
// Pre-work: lines in the prework bucket are counted in internalCost only.
// Negative inputs (qty/unitPrice/markup/waste) are clamped to 0 — they
// would otherwise silently invert costs and quietly tank a quote.
export function computeTotals(
  lines: LineItem[],
  options: ComputeTotalsOptions,
): EstimateTotals {
  const overheadPct = nonNeg(options.overheadPct);
  const rooms = options.rooms;
  const contingencyPct = nonNeg(options.contingencyPct ?? 0);
  const disabledRoomIds = new Set(
    (rooms ?? []).filter((r) => !r.enabled).map((r) => r.id),
  );

  const lineSubtotals: LineSubtotal[] = lines.map((l) => {
    const qty = nonNeg(l.qty);
    const unitPrice = nonNeg(l.unitPrice);
    const wastePct = nonNeg(l.wastePct);
    const markupPct = nonNeg(l.markupPct);
    const buyingQty = qty * (1 + wastePct / 100);
    const cost = buyingQty * unitPrice;
    const markupAmount = cost * (markupPct / 100);
    const price = cost + markupAmount;
    return {
      id: l.id,
      buyingQty,
      cost,
      markupAmount,
      price,
      bucket: bucketForCategory(l.category),
      excludedFromQuote: lineExcludedFromQuote(l),
      roomId: l.roomId,
      disabledByRoom: !!l.roomId && disabledRoomIds.has(l.roomId),
    };
  });

  const costs = lineSubtotals.reduce(
    (acc, s) => {
      if (s.disabledByRoom) return acc;
      if (s.bucket === "prework") {
        return { ...acc, prework: acc.prework + s.cost };
      }
      const mat = s.bucket === "materials" ? s.cost : 0;
      const lab = s.bucket === "labour" ? s.cost : 0;
      return {
        materials: acc.materials + mat,
        labour: acc.labour + lab,
        prework: acc.prework,
        direct: acc.direct + mat + lab,
      };
    },
    { materials: 0, labour: 0, prework: 0, direct: 0 },
  );

  // Markup + line-price totals exclude disabled rooms AND excluded-from-quote lines.
  const enabledQuotedLines = lineSubtotals.filter(
    (s) => !s.disabledByRoom && !s.excludedFromQuote,
  );
  const markupTotal = enabledQuotedLines.reduce(
    (sum, s) => sum + s.markupAmount,
    0,
  );
  const linesPriceSubtotal = enabledQuotedLines.reduce(
    (sum, s) => sum + s.price,
    0,
  );

  const overhead = costs.direct * (overheadPct / 100);
  const quotedBeforeContingency = linesPriceSubtotal + overhead;
  const contingency = quotedBeforeContingency * (contingencyPct / 100);
  const quoted = quotedBeforeContingency + contingency;

  // Firm cost (what Andrew definitely owes): direct + overhead.
  // True cost if contingency materialises: direct + prework + overhead + contingency.
  // Margin treats contingency as expected labour — i.e. it doesn't pretend
  // the buffer is profit (which would let optimistic margins drive bad bids).
  const totalCost = costs.direct + overhead;
  const internalCost = costs.direct + costs.prework + overhead + contingency;

  const effectiveMarginPct =
    quoted > 0
      ? ((quoted - totalCost - contingency) / quoted) * 100
      : 0;

  // Per-section breakdown for headers.
  const perSection: Record<
    string,
    { count: number; cost: number; price: number }
  > = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const s = lineSubtotals[i];
    if (s.disabledByRoom) continue;
    const key = l.category || "Other";
    if (!perSection[key]) perSection[key] = { count: 0, cost: 0, price: 0 };
    perSection[key].count += 1;
    perSection[key].cost += s.cost;
    if (!s.excludedFromQuote) perSection[key].price += s.price;
  }

  // Per-room rollup for QuoteSummary sidebar.
  const perRoom: Record<
    string,
    { cost: number; price: number; lineCount: number }
  > = {};
  for (const s of lineSubtotals) {
    if (s.disabledByRoom) continue;
    if (!s.roomId) continue;
    if (!perRoom[s.roomId]) {
      perRoom[s.roomId] = { cost: 0, price: 0, lineCount: 0 };
    }
    perRoom[s.roomId].cost += s.cost;
    if (!s.excludedFromQuote) perRoom[s.roomId].price += s.price;
    perRoom[s.roomId].lineCount += 1;
  }

  return {
    lineSubtotals,
    costs,
    markupTotal,
    overhead,
    contingency,
    quoted,
    internalCost,
    totalCost,
    effectiveMarginPct,
    perSection,
    perRoom,
  };
}

// ─── Auto-derive labour hours from cabinet counts ──────────────────────
// Used by Assembly, Install, and the loading-time portion of Delivery.
// `minutesPerType` comes from the Catalog's CabinetType table — different
// for assembly vs install vs loading.

export function deriveLabourHoursFromCabinets(
  summary: CabinetSummary,
  minutesPerType: Record<CabinetTypeId, number>,
): number {
  let totalMinutes = 0;
  for (const type of CABINET_TYPES) {
    totalMinutes += nonNeg(summary[type].count) * nonNeg(minutesPerType[type] ?? 0);
  }
  return totalMinutes / 60;
}

// Partition a CabinetSummary into one-summary-per-roomId so auto-derived
// Assembly/Install lines can be tagged with the correct room and honour
// room toggles. Cabinets without a roomId roll into the "_no_room"
// partition (key = undefined) → produces a job-wide line.
//
// Note: each cabinet TYPE owns a single roomId today (e.g. all base
// cabinets in one room). Mixed-room assignment within a type would
// need a list-of-entries data shape — out of scope for this slice.

export type CabinetPartition = Map<string | undefined, CabinetSummary>;

export function partitionCabinetSummaryByRoom(
  summary: CabinetSummary,
): CabinetPartition {
  const out: CabinetPartition = new Map();
  function ensure(key: string | undefined): CabinetSummary {
    let v = out.get(key);
    if (!v) {
      v = {
        base: { count: 0, linearFt: 0 },
        wall: { count: 0, linearFt: 0 },
        tall: { count: 0, linearFt: 0 },
        island: { count: 0, linearFt: 0 },
        pulls: 0,
      };
      out.set(key, v);
    }
    return v;
  }
  for (const type of CABINET_TYPES) {
    const cab = summary[type];
    if (cab.count === 0 && cab.linearFt === 0) continue;
    const part = ensure(cab.roomId);
    part[type] = { count: cab.count, linearFt: cab.linearFt, roomId: cab.roomId };
  }
  return out;
}

// Clamp helper — refuses negative inputs so a stray "-4" in an hours field
// never silently subtracts from a quote.
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ─── Delivery calculator ────────────────────────────────────────────────
// Cost = gas + travel labour + loading labour. Returns the three parts
// for UI display plus the total. Travel uses install rate (the truck is
// usually the install crew). Loading uses shop rate.

export type DeliveryCostBreakdown = {
  gasCost: number;
  travelCost: number;
  loadingCost: number;
  loadingHours: number;
  total: number;
};

export function computeDeliveryCost(
  delivery: DeliveryState,
  totalCabinetCount: number,
  rates: LabourRates,
): DeliveryCostBreakdown {
  const gasCost = delivery.miles * 2 * delivery.gasRatePerMile; // round trip
  const travelCost = delivery.travelHours * rates.installRate;
  const loadingHours = (totalCabinetCount * delivery.loadMinutesPerCabinet) / 60;
  const loadingCost = loadingHours * rates.shopRate;
  return {
    gasCost,
    travelCost,
    loadingCost,
    loadingHours,
    total: gasCost + travelCost + loadingCost,
  };
}

// ─── Deficiencies block ─────────────────────────────────────────────────
// Two parts: hours budget × install rate (for touch-ups) + contingency %
// applied to quoted total (for unknowns). The contingency % is returned
// so computeTotals can fold it in; the hours budget becomes its own line
// or its own cost figure depending on how the renderer uses it.

export type DeficienciesCostBreakdown = {
  budgetCost: number; // hoursBudget × installRate
  contingencyPct: number; // pass-through for computeTotals
};

export function computeDeficienciesCost(
  deficiencies: DeficienciesState,
  rates: LabourRates,
): DeficienciesCostBreakdown {
  return {
    budgetCost: deficiencies.hoursBudget * rates.installRate,
    contingencyPct: deficiencies.contingencyPct,
  };
}

// ─── Pre-work cost ──────────────────────────────────────────────────────
// Sums hours across the three fixed slots and prices them at design rate.

export type PreWorkCostBreakdown = {
  totalHours: number;
  totalCost: number;
  perSlot: Record<PreWorkSlotId, { hours: number; cost: number; label: string }>;
};

export function computePreWorkCost(
  prework: PreWorkState,
  rates: LabourRates,
): PreWorkCostBreakdown {
  const slots = Object.keys(PRE_WORK_SLOT_LABELS) as PreWorkSlotId[];
  let totalHours = 0;
  let totalCost = 0;
  const perSlot = {} as PreWorkCostBreakdown["perSlot"];
  for (const id of slots) {
    const hours = prework[id]?.hours ?? 0;
    const cost = hours * rates.designRate;
    perSlot[id] = { hours, cost, label: PRE_WORK_SLOT_LABELS[id] };
    totalHours += hours;
    totalCost += cost;
  }
  return { totalHours, totalCost, perSlot };
}
