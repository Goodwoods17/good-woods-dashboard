export type LineItem = {
  id: string;
  description: string;
  qty: number;
  materialId: string | null;
  materialPricePerSqft: number;
  labourHours: number;
  labourRate: number;
  markupPct: number;
};

export const DEFAULT_LABOUR_RATE = 85;
export const DEFAULT_MARKUP_PCT = 35;
