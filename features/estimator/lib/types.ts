export type LineItem = {
  id: string;
  description: string;
  qty: number;
  materialId: string | null;
  materialPricePerSqft: number;
  labourHours: number;
  labourRate: number;
};

export const DEFAULT_LABOUR_RATE = 85;
