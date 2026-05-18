import type { LineItem } from "./types";

export type LineSubtotal = {
  id: string;
  buyingQty: number; // qty × (1 + waste%)
  cost: number; // buyingQty × unitPrice
  markupAmount: number; // cost × markup%
  price: number; // cost + markupAmount
  isLabour: boolean;
  isMaterial: boolean;
};

export type EstimateTotals = {
  lineSubtotals: LineSubtotal[];
  costs: {
    materials: number; // anything not labour and not "Overhead" category
    labour: number; // unit === "hr"
    direct: number; // materials + labour
  };
  markupTotal: number; // sum of per-line markupAmount
  overhead: number; // directs × overheadPct
  totalCost: number; // direct + overhead
  quoted: number; // sum of line prices + overhead
  effectiveMarginPct: number; // (quoted - totalCost) / quoted × 100
};

function isLabourLine(line: LineItem): boolean {
  // Heuristic: labour is anything priced in hours. Mozaik exports
  // Machining / Labor / Part Labor as Hrs — they all roll up here.
  return line.unit === "hr";
}

function isMaterialLine(line: LineItem): boolean {
  return !isLabourLine(line);
}

// Per-line markup model, with waste% on cost-of-materials math:
//   buyingQty   = qty × (1 + waste%/100)
//   lineCost    = buyingQty × unitPrice
//   linePrice   = lineCost × (1 + markup%/100)
//   quoted      = sum(linePrice) + overhead
//
// Markup is on the WASTE-ADJUSTED cost, not the finished-qty cost — so
// you're not eating the waste yourself. Overhead is workshop-wide on
// total direct cost.
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
      isLabour: isLabourLine(l),
      isMaterial: isMaterialLine(l),
    };
  });

  const costs = lineSubtotals.reduce(
    (acc, s) => ({
      materials: acc.materials + (s.isMaterial ? s.cost : 0),
      labour: acc.labour + (s.isLabour ? s.cost : 0),
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

  return {
    lineSubtotals,
    costs,
    markupTotal,
    overhead,
    totalCost,
    quoted,
    effectiveMarginPct,
  };
}
