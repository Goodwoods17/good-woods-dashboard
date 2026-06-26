import { describe, it, expect } from "vitest";
import type { CatalogItemView, CatalogOffer } from "@features/catalog/lib/catalogRowMap";
import {
  DEFAULT_PRICE_JUMP_THRESHOLD_PCT,
  normalizeSku,
  computePriceUpdate,
  matchOfferForLine,
  buildSkuMatches,
} from "./catalogPriceUpdate";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeOffer(over: Partial<CatalogOffer> = {}): CatalogOffer {
  return {
    id: "of_1",
    itemId: "it_1",
    supplierId: "sup_1",
    unitPrice: 100,
    sku: "MAP-34",
    isPreferred: false,
    cartMeta: {},
    active: true,
    priceUpdatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function makeItem(over: Partial<CatalogItemView> = {}): CatalogItemView {
  const offers = over.offers ?? [makeOffer()];
  const best = offers.find((o) => o.active) ?? null;
  return {
    id: "it_1",
    kind: "material",
    name: "Hard maple sheet",
    section: "sheet",
    unit: "sheet",
    unitPrice: 100,
    defaultWastePct: 0,
    defaultMarkupPct: 0,
    pricing: null,
    attributes: {},
    active: true,
    categoryId: null,
    subcategoryId: null,
    priceUpdatedAt: "2026-06-01T00:00:00.000Z",
    offers,
    bestOffer: best,
    preferredOffer: null,
    surfacedOffer: best,
    surfacedPrice: best?.unitPrice ?? 100,
    surfacedSupplierId: best?.supplierId ?? null,
    surfacedSupplierName: "Reimer",
    ...over,
  } as CatalogItemView;
}

// ─── normalizeSku ────────────────────────────────────────────────────────────

describe("normalizeSku", () => {
  it("trims, upper-cases, and strips internal whitespace", () => {
    expect(normalizeSku("  map-34 ")).toBe("MAP-34");
    expect(normalizeSku("map 34")).toBe("MAP34");
    expect(normalizeSku("MAP-34")).toBe("MAP-34");
  });

  it("returns '' for null/undefined/blank", () => {
    expect(normalizeSku(null)).toBe("");
    expect(normalizeSku(undefined)).toBe("");
    expect(normalizeSku("   ")).toBe("");
  });
});

// ─── computePriceUpdate ──────────────────────────────────────────────────────

describe("computePriceUpdate", () => {
  it("computes an upward delta + signed pct", () => {
    const u = computePriceUpdate(100, 130);
    expect(u.oldPrice).toBe(100);
    expect(u.newPrice).toBe(130);
    expect(u.deltaAbs).toBeCloseTo(30, 2);
    expect(u.deltaPct).toBeCloseTo(30, 2);
    expect(u.direction).toBe("up");
  });

  it("computes a downward delta", () => {
    const u = computePriceUpdate(100, 90);
    expect(u.deltaAbs).toBeCloseTo(-10, 2);
    expect(u.deltaPct).toBeCloseTo(-10, 2);
    expect(u.direction).toBe("down");
  });

  it("reports flat when unchanged", () => {
    const u = computePriceUpdate(100, 100);
    expect(u.direction).toBe("flat");
    expect(u.isLargeJump).toBe(false);
  });

  it("flags a jump at or above the default threshold (15%)", () => {
    expect(computePriceUpdate(100, 115).isLargeJump).toBe(true); // exactly 15%
    expect(computePriceUpdate(100, 114).isLargeJump).toBe(false); // 14%
    expect(computePriceUpdate(100, 80).isLargeJump).toBe(true); // -20% (big drop)
  });

  it("honours a configurable threshold", () => {
    expect(computePriceUpdate(100, 108, 5).isLargeJump).toBe(true); // 8% vs 5% threshold
    expect(computePriceUpdate(100, 108, 25).isLargeJump).toBe(false); // 8% vs 25% threshold
  });

  it("treats a brand-new price (old 0) as a large jump with null pct", () => {
    const u = computePriceUpdate(0, 50);
    expect(u.deltaPct).toBeNull();
    expect(u.direction).toBe("up");
    expect(u.isLargeJump).toBe(true);
  });

  it("exposes a sensible default threshold", () => {
    expect(DEFAULT_PRICE_JUMP_THRESHOLD_PCT).toBe(15);
  });
});

// ─── matchOfferForLine ───────────────────────────────────────────────────────

describe("matchOfferForLine", () => {
  it("matches a line SKU to an offer SKU (case/space-insensitive)", () => {
    const items = [makeItem()];
    const found = matchOfferForLine({ sku: "  map-34 " }, items);
    expect(found?.offer.id).toBe("of_1");
    expect(found?.item.name).toBe("Hard maple sheet");
  });

  it("returns null when the line has no SKU", () => {
    expect(matchOfferForLine({ sku: null }, [makeItem()])).toBeNull();
    expect(matchOfferForLine({ sku: "  " }, [makeItem()])).toBeNull();
  });

  it("returns null when no offer SKU matches", () => {
    expect(matchOfferForLine({ sku: "NOPE-99" }, [makeItem()])).toBeNull();
  });

  it("never matches a door-kind item (no SKUs — New Surrey excluded)", () => {
    const door = makeItem({
      id: "it_door",
      kind: "door",
      offers: [makeOffer({ id: "of_door", itemId: "it_door", sku: "MAP-34" })],
    });
    expect(matchOfferForLine({ sku: "MAP-34" }, [door])).toBeNull();
  });

  it("ignores inactive offers", () => {
    const item = makeItem({ offers: [makeOffer({ active: false })] });
    expect(matchOfferForLine({ sku: "MAP-34" }, [item])).toBeNull();
  });

  it("prefers the offer from the linked supplier when multiple share a SKU", () => {
    const itemA = makeItem({
      id: "a",
      offers: [makeOffer({ id: "ofa", itemId: "a", supplierId: "sup_a", sku: "X1" })],
    });
    const itemB = makeItem({
      id: "b",
      offers: [makeOffer({ id: "ofb", itemId: "b", supplierId: "sup_b", sku: "X1" })],
    });
    const found = matchOfferForLine({ sku: "X1" }, [itemA, itemB], {
      preferSupplierId: "sup_b",
    });
    expect(found?.offer.id).toBe("ofb");
  });
});

// ─── buildSkuMatches ─────────────────────────────────────────────────────────

describe("buildSkuMatches", () => {
  it("builds a matched row with a price update when the line carries a unit price", () => {
    const items = [makeItem()]; // offer price 100
    const [row] = buildSkuMatches([{ id: "l1", sku: "MAP-34", unitPrice: 130 }], items);
    expect(row.matched).toBe(true);
    expect(row.offer?.id).toBe("of_1");
    expect(row.itemName).toBe("Hard maple sheet");
    expect(row.update?.oldPrice).toBe(100);
    expect(row.update?.newPrice).toBe(130);
    expect(row.update?.isLargeJump).toBe(true);
  });

  it("builds an unmatched row that falls back to manual assignment", () => {
    const [row] = buildSkuMatches([{ id: "l2", sku: "ZZZ", unitPrice: 5 }], [makeItem()]);
    expect(row.matched).toBe(false);
    expect(row.offer).toBeNull();
    expect(row.update).toBeNull();
  });

  it("matches but leaves update null when the line has no unit price", () => {
    const [row] = buildSkuMatches([{ id: "l3", sku: "MAP-34", unitPrice: null }], [makeItem()]);
    expect(row.matched).toBe(true);
    expect(row.update).toBeNull();
  });
});
