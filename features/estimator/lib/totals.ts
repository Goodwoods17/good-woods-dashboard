import type { LineItem } from "./types";

export type LineSubtotal = {
  id: string;
  matCost: number;
  labCost: number;
  total: number;
};

export type EstimateTotals = {
  lineSubtotals: LineSubtotal[];
  directs: { mat: number; lab: number; total: number };
  overhead: number;
  cost: number;
  price: number;
  grossMargin: number;
};

// Quoted price uses margin-on-revenue model: price = cost / (1 - marginPct/100).
// This is NOT markup — margin% is the share of price that ends up as profit.
export function computeTotals(
  lines: LineItem[],
  overheadPct: number,
  marginPct: number
): EstimateTotals {
  const lineSubtotals: LineSubtotal[] = lines.map((l) => {
    const matCost = l.qty * l.materialPricePerSqft;
    const labCost = l.labourHours * l.labourRate;
    return { id: l.id, matCost, labCost, total: matCost + labCost };
  });

  const directs = lineSubtotals.reduce(
    (acc, l) => ({
      mat: acc.mat + l.matCost,
      lab: acc.lab + l.labCost,
      total: acc.total + l.total,
    }),
    { mat: 0, lab: 0, total: 0 }
  );

  const overhead = directs.total * (overheadPct / 100);
  const cost = directs.total + overhead;
  const denom = Math.max(0.01, 1 - marginPct / 100);
  const price = cost / denom;
  const grossMargin = price - cost;

  return { lineSubtotals, directs, overhead, cost, price, grossMargin };
}
