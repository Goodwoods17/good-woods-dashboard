/**
 * Pure catalog price-update logic for Slice 6 (issue #51) — close the pricing
 * loop. No Supabase, no React: match an invoice line's product-no (SKU) to a
 * catalog supplier offer, compute the old → new price delta, and flag a large
 * jump that's worth a re-quote. The component layers `updateOffer` +
 * `logPrice(source: "import")` on top of these decisions.
 *
 * Door/matrix invoices (New Surrey) are EXCLUDED — those have no SKUs, and we
 * skip `door`-kind items defensively so a coincidental SKU can never reprice a
 * matrix door (feature spec non-goal).
 */
import type { CatalogItemView, CatalogOffer } from "@features/catalog/lib/catalogRowMap";
import type { InvoiceLine } from "./types";

/**
 * Default re-quote threshold: a unit-price move of ±15% or more flags the line
 * so a big swing prompts a fresh quote. Configurable per call (the `thresholdPct`
 * params below) so a future settings switch can tune it without touching callers.
 */
export const DEFAULT_PRICE_JUMP_THRESHOLD_PCT = 15;

/** Cents-accurate rounding (avoids 0.1 + 0.2 drift) for the displayed delta. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Canonicalise a SKU for comparison: trim, upper-case, and drop internal
 * whitespace. Supplier "product no" fields drift on case + spacing between the
 * invoice and the catalog, so a loose-but-deterministic key avoids false misses
 * without risking a wrong match (it never collapses distinct codes).
 */
export function normalizeSku(sku: string | null | undefined): string {
  return (sku ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export type PriceDeltaDirection = "up" | "down" | "flat";

export type PriceUpdate = {
  oldPrice: number; // the offer's current unit price
  newPrice: number; // the invoice line's unit price
  deltaAbs: number; // newPrice - oldPrice (rounded to the cent)
  deltaPct: number | null; // signed % vs old; null when there was no prior price
  direction: PriceDeltaDirection;
  isLargeJump: boolean; // |deltaPct| >= threshold (re-quote nudge)
};

/**
 * Compare an offer's current price to the price seen on the invoice line.
 *
 * With no prior price (`oldPrice === 0`) the percentage is undefined; a positive
 * new price is treated as a large jump so a brand-new figure still gets a glance.
 */
export function computePriceUpdate(
  oldPrice: number,
  newPrice: number,
  thresholdPct: number = DEFAULT_PRICE_JUMP_THRESHOLD_PCT
): PriceUpdate {
  const deltaAbs = round2(newPrice - oldPrice);
  let deltaPct: number | null;
  let direction: PriceDeltaDirection;
  if (oldPrice === 0) {
    deltaPct = null;
    direction = newPrice > 0 ? "up" : "flat";
  } else {
    deltaPct = ((newPrice - oldPrice) / oldPrice) * 100;
    direction = newPrice > oldPrice ? "up" : newPrice < oldPrice ? "down" : "flat";
  }
  const isLargeJump = deltaPct === null ? newPrice > 0 : Math.abs(deltaPct) >= thresholdPct;
  return { oldPrice, newPrice, deltaAbs, deltaPct, direction, isLargeJump };
}

/** A matched offer + the item it belongs to (for display: name, unit). */
export type OfferMatch = { offer: CatalogOffer; item: CatalogItemView };

/**
 * Find the catalog offer whose SKU matches an invoice line's product-no. Skips
 * `door`-kind items (no SKUs — New Surrey excluded) and inactive offers. When
 * several offers share a SKU, the linked supplier's offer wins (`preferSupplierId`).
 */
export function matchOfferForLine(
  line: Pick<InvoiceLine, "sku">,
  items: CatalogItemView[],
  opts?: { preferSupplierId?: string | null }
): OfferMatch | null {
  const key = normalizeSku(line.sku);
  if (!key) return null;

  const candidates: OfferMatch[] = [];
  for (const item of items) {
    if (item.kind === "door") continue; // matrix doors have no SKUs — excluded
    for (const offer of item.offers) {
      if (!offer.active) continue;
      if (normalizeSku(offer.sku) === key) candidates.push({ offer, item });
    }
  }
  if (candidates.length === 0) return null;

  const preferSupplierId = opts?.preferSupplierId;
  const preferred = preferSupplierId
    ? candidates.find((c) => c.offer.supplierId === preferSupplierId)
    : undefined;
  return preferred ?? candidates[0];
}

/** One invoice line resolved against the catalog: matched offer + price delta. */
export type LineSkuMatch = {
  lineId: string;
  lineSku: string | null;
  newUnitPrice: number | null;
  matched: boolean;
  offer: CatalogOffer | null;
  itemName: string | null;
  itemUnit: string | null;
  /** Null when unmatched, or matched but the line carries no unit price. */
  update: PriceUpdate | null;
};

/**
 * Resolve every invoice line against the catalog. Matched lines get a price
 * update (old offer price → new line price) when the line carries a unit price;
 * unmatched lines fall through to manual assignment in the UI.
 */
export function buildSkuMatches(
  lines: Pick<InvoiceLine, "id" | "sku" | "unitPrice">[],
  items: CatalogItemView[],
  opts?: { preferSupplierId?: string | null; thresholdPct?: number }
): LineSkuMatch[] {
  const threshold = opts?.thresholdPct ?? DEFAULT_PRICE_JUMP_THRESHOLD_PCT;
  return lines.map((line) => {
    const found = matchOfferForLine(line, items, { preferSupplierId: opts?.preferSupplierId });
    if (!found) {
      return {
        lineId: line.id,
        lineSku: line.sku ?? null,
        newUnitPrice: line.unitPrice ?? null,
        matched: false,
        offer: null,
        itemName: null,
        itemUnit: null,
        update: null,
      };
    }
    const update =
      line.unitPrice != null
        ? computePriceUpdate(found.offer.unitPrice, line.unitPrice, threshold)
        : null;
    return {
      lineId: line.id,
      lineSku: line.sku ?? null,
      newUnitPrice: line.unitPrice ?? null,
      matched: true,
      offer: found.offer,
      itemName: found.item.name,
      itemUnit: found.item.unit,
      update,
    };
  });
}
