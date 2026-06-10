/**
 * Door-order costing against the New Surrey price book. Pure + unit-testable.
 *
 * Per-line: `sqft x baseRate + finishSurcharge x sqft + perSqftAddons x sqft +
 * perUnitAddons`. No per-door minimum (locked decision). Order total = sum of
 * lines + manual courier shippingCost.
 *
 * Only doors + drawer fronts are ordered on the Wood Doors form, so only those
 * kinds are costed here. End panels + toe kicks count toward Summary sqft (see
 * sqft.ts) but ship on a separate form (later phase), so they're excluded.
 */
import { lookupBaseRate, NEW_SURREY_PRICE_BOOK, type PriceBook } from "./newSurreyPriceBook";
import { elementSqft } from "./sqft";
import type { ElementKind, OrderSettings, RefaceElement, RefaceProject } from "./types";

/** Element kinds that appear on the New Surrey Wood Doors order + its costing. */
export const ORDERABLE_KINDS: ElementKind[] = ["door", "drawer"];

export function isOrderable(el: Pick<RefaceElement, "kind">): boolean {
  return ORDERABLE_KINDS.includes(el.kind);
}

export type ElementCost = {
  element: RefaceElement;
  sqft: number;
  baseRate: number | null;
  /** True when the chosen category/row/column cell has no price. */
  unpriced: boolean;
  finishSurcharge: number;
  perSqftAddonRate: number;
  perUnitCost: number;
  lineCost: number;
};

/** Sum of per-sqft add-on rates enabled in settings. */
function perSqftAddonRate(settings: OrderSettings, book: PriceBook): number {
  const a = settings.addOns;
  let rate = 0;
  if (a.hingeHoles) rate += book.addOns.hingeHoles;
  if (a.parklane) rate += book.addOns.parklane;
  if (a.extraGroove) rate += book.addOns.extraGroove;
  if (a.outsideProfileAddon) rate += book.addOns.outsideProfile;
  return rate;
}

/** MDF applied-finish surcharge per sqft (0 for non-MDF or unmatched finish). */
function finishSurchargeRate(settings: OrderSettings, book: PriceBook): number {
  if (settings.materialCategory !== "mdf") return 0;
  return book.mdfFinishSurcharge[settings.finish] ?? 0;
}

export function costElement(
  element: RefaceElement,
  settings: OrderSettings,
  book: PriceBook = NEW_SURREY_PRICE_BOOK
): ElementCost {
  const sqft = elementSqft(element);
  const baseRate = lookupBaseRate(settings);
  const finishSurcharge = finishSurchargeRate(settings, book);
  const addonRate = perSqftAddonRate(settings, book);
  const qty = element.qty > 0 ? element.qty : 1;
  const perUnitCost =
    (element.mullionSections * book.addOns.mullionPerSection +
      element.dividers * book.addOns.dividerEach) *
    qty;
  const lineCost = sqft * ((baseRate ?? 0) + finishSurcharge + addonRate) + perUnitCost;
  return {
    element,
    sqft,
    baseRate,
    unpriced: baseRate === null,
    finishSurcharge,
    perSqftAddonRate: addonRate,
    perUnitCost,
    lineCost,
  };
}

export type OrderQuote = {
  lines: ElementCost[];
  subtotal: number;
  shippingCost: number;
  total: number;
  /** True if any orderable line couldn't resolve a base rate. */
  hasUnpriced: boolean;
};

/** Cost every orderable element across the project at its settings. */
export function priceOrder(
  project: RefaceProject,
  book: PriceBook = NEW_SURREY_PRICE_BOOK
): OrderQuote {
  const settings = project.orderSettings;
  const lines = project.photos
    .flatMap((p) => p.elements)
    .filter(isOrderable)
    .map((el) => costElement(el, settings, book));

  const subtotal = lines.reduce((sum, l) => sum + l.lineCost, 0);
  const shippingCost = settings.shippingCost > 0 ? settings.shippingCost : 0;
  return {
    lines,
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
    hasUnpriced: lines.some((l) => l.unpriced),
  };
}
