// Local-only inventory store (browser localStorage). Lives outside the
// React tree so the hook stays thin and the seed/load logic can be tested
// independently.

export type StockEntry = {
  id: string;
  materialId: string;
  qtyOnHand: number;
  reorderPoint: number;
  unit: string;
};

const STOCK_KEY = "gw_inventory_v1";

export const SEED_STOCK: StockEntry[] = [
  { id: "s1", materialId: "m1", qtyOnHand: 24, reorderPoint: 12, unit: "bd-ft" },
  { id: "s2", materialId: "m3", qtyOnHand: 8, reorderPoint: 6, unit: "sheets" },
  { id: "s3", materialId: "m4", qtyOnHand: 4, reorderPoint: 6, unit: "sheets" },
  { id: "s4", materialId: "m6", qtyOnHand: 32, reorderPoint: 16, unit: "rolls" },
  { id: "s5", materialId: "m7", qtyOnHand: 18, reorderPoint: 30, unit: "pairs" },
];

export function loadStock(): StockEntry[] {
  if (typeof window === "undefined") return SEED_STOCK;
  try {
    const raw = window.localStorage.getItem(STOCK_KEY);
    if (!raw) return SEED_STOCK;
    return JSON.parse(raw);
  } catch {
    return SEED_STOCK;
  }
}

export function saveStock(stock: StockEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  } catch {
    /* silent */
  }
}

export function newStockId(): string {
  return `s${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
}
