import type { LineItem } from "./types";

export type LineSubtotal = {
  id: string;
  matCost: number;
  labCost: number;
  direct: number;
  markupAmount: number;
  price: number;
};

export type EstimateTotals = {
  lineSubtotals: LineSubtotal[];
  directs: { mat: number; lab: number; total: number };
  markupTotal: number;
  overhead: number;
  totalCost: number;
  quoted: number;
  effectiveMarginPct: number;
};

// Per-line markup model:
//   linePrice = direct cost × (1 + markupPct/100)
//   quote     = sum(linePrice) + overhead
// Markup is applied to direct cost only (materials + labour for that line),
// not to overhead — overhead is a separate workshop-wide line on top.
export function computeTotals(
  lines: LineItem[],
  overheadPct: number
): EstimateTotals {
  const lineSubtotals: LineSubtotal[] = lines.map((l) => {
    const matCost = l.qty * l.materialPricePerSqft;
    const labCost = l.labourHours * l.labourRate;
    const direct = matCost + labCost;
    const markupAmount = direct * (l.markupPct / 100);
    const price = direct + markupAmount;
    return { id: l.id, matCost, labCost, direct, markupAmount, price };
  });

  const directs = lineSubtotals.reduce(
    (acc, l) => ({
      mat: acc.mat + l.matCost,
      lab: acc.lab + l.labCost,
      total: acc.total + l.direct,
    }),
    { mat: 0, lab: 0, total: 0 }
  );

  const markupTotal = lineSubtotals.reduce((s, l) => s + l.markupAmount, 0);
  const linesPriceSubtotal = lineSubtotals.reduce((s, l) => s + l.price, 0);

  const overhead = directs.total * (overheadPct / 100);
  const totalCost = directs.total + overhead;
  const quoted = linesPriceSubtotal + overhead;
  const effectiveMarginPct =
    quoted > 0 ? ((quoted - totalCost) / quoted) * 100 : 0;

  return {
    lineSubtotals,
    directs,
    markupTotal,
    overhead,
    totalCost,
    quoted,
    effectiveMarginPct,
  };
}
