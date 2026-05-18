import type { LineItem } from "./types";
import { bucketForCategory } from "./sections";

export type LineSubtotal = {
  id: string;
  buyingQty: number; // qty × (1 + waste%)
  cost: number; // buyingQty × unitPrice
  markupAmount: number; // cost × markup%
  price: number; // cost + markupAmount
  bucket: "materials" | "labour";
};

export type EstimateTotals = {
  lineSubtotals: LineSubtotal[];
  costs: {
    materials: number; // lines bucketed as "materials"
    labour: number; // lines bucketed as "labour"
    direct: number; // materials + labour
  };
  markupTotal: number; // sum of per-line markupAmount
  overhead: number; // directs × overheadPct
  totalCost: number; // direct + overhead
  quoted: number; // sum of line prices + overhead
  effectiveMarginPct: number; // (quoted - totalCost) / quoted × 100
  perSection: Record<string, { count: number; cost: number; price: number }>;
};

// Per-line markup model, with waste% on the cost-of-materials math:
//   buyingQty = qty × (1 + waste%/100)
//   lineCost  = buyingQty × unitPrice
//   linePrice = lineCost × (1 + markup%/100)
//   quoted    = sum(linePrice) + overhead
//
// Bucketing into materials vs labour is by section (lib/sections.ts).
// Lines whose category doesn't match a section default to materials.
export function computeTotals(
  lines: LineItem[],
  overheadPct: number
): EstimateTotals {
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
    };
  });

  const costs = lineSubtotals.reduce(
    (acc, s) => ({
      materials: acc.materials + (s.bucket === "materials" ? s.cost : 0),
      labour: acc.labour + (s.bucket === "labour" ? s.cost : 0),
      direct: acc.direct + s.cost,
    }),
    { materials: 0, labour: 0, direct: 0 }
  );

  const markupTotal = lineSubtotals.reduce((sum, s) => sum + s.markupAmount, 0);
  const linesPriceSubtotal = lineSubtotals.reduce((sum, s) => sum + s.price, 0);

  const overhead = costs.direct * (overheadPct / 100);
  const totalCost = costs.direct + overhead;
  const quoted = linesPriceSubtotal + overhead;
  const effectiveMarginPct =
    quoted > 0 ? ((quoted - totalCost) / quoted) * 100 : 0;

  // Per-section breakdown for the section headers (count + cost + price).
  const perSection: Record<
    string,
    { count: number; cost: number; price: number }
  > = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const s = lineSubtotals[i];
    const key = l.category || "Other";
    if (!perSection[key]) perSection[key] = { count: 0, cost: 0, price: 0 };
    perSection[key].count += 1;
    perSection[key].cost += s.cost;
    perSection[key].price += s.price;
  }

  return {
    lineSubtotals,
    costs,
    markupTotal,
    overhead,
    totalCost,
    quoted,
    effectiveMarginPct,
    perSection,
  };
}
