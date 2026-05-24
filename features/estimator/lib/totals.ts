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
//   internalCost = direct + prework + overhead (what the job REALLY costs Andrew)
//
// Rooms: lines whose roomId points at a disabled room contribute nothing.
// Pre-work: lines in the prework bucket are counted in internalCost only.
export function computeTotals(
  lines: LineItem[],
  options: ComputeTotalsOptions,
): EstimateTotals {
  const { overheadPct, rooms, contingencyPct = 0 } = options;
  const disabledRoomIds = new Set(
    (rooms ?? []).filter((r) => !r.enabled).map((r) => r.id),
  );

  const lineSubtotals: LineSubtotal[] = lines.map((l) => {
    const buyingQty = l.qty * (1 + l.wastePct / 100);
    const cost = buyingQty * l.unitPrice;
    const markupAmount = cost * (l.markupPct / 100);
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

  // True cost reality = direct + prework + overhead. Quoted price needs to
  // beat this for the job to be net positive after the unbilled work.
  const internalCost = costs.direct + costs.prework + overhead;
  const totalCost = costs.direct + overhead;

  const effectiveMarginPct =
    quoted > 0 ? ((quoted - totalCost) / quoted) * 100 : 0;

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
    totalMinutes += summary[type].count * (minutesPerType[type] ?? 0);
  }
  return totalMinutes / 60;
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
