/**
 * Supabase row <-> domain conversion for the catalog's supplier/offer layer,
 * plus the in-memory stitching that turns three flat row sets (items, offers,
 * suppliers) into the {@link CatalogItemView} the UI consumes.
 *
 * Mirrors the pattern in features/reface/lib/refaceRowMap.ts. Domain decision:
 * docs/decisions/0006-catalog-items-vs-offers.md — offers belong only to
 * procured kinds; the surfaced price = preferred ?? cheapest active ?? the
 * item's own inline unit_price, so an item is never priceless.
 */
import type { CatalogItem } from "./catalogStore";

export const SUPPLIERS_TABLE = "catalog_suppliers";
export const OFFERS_TABLE = "catalog_offers";

// The procured kinds that carry offers. In-house kinds (finish/labour/service)
// keep their inline unit_price and never get an offer.
export const PROCURED_KINDS = ["material", "hardware", "door", "insert"] as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type CatalogSupplier = {
  id: string;
  name: string;
  website?: string;
  cartConfig: Record<string, unknown>; // reserved for the future cart-loader
  contactId?: string; // optional CRM link; a supplier is NOT a contact
  notes?: string;
};

export type CatalogOffer = {
  id: string;
  itemId: string;
  supplierId: string;
  unitPrice: number; // priced in the ITEM's unit (offers inherit the item unit)
  productUrl?: string; // supplier buy page (cart-loader navigate target)
  sku?: string; // supplier line identity (cart-loader line key)
  isPreferred: boolean;
  cartMeta: Record<string, unknown>; // reserved: per-offer option/qty hints
  active: boolean; // soft-delete
  priceUpdatedAt: string;
  notes?: string;
};

// An item with its offers stitched on and the surfaced offer resolved. This is
// what the Materials table renders and what toMaterial() reads.
export type CatalogItemView = CatalogItem & {
  offers: CatalogOffer[]; // active offers, cheapest-first
  bestOffer: CatalogOffer | null; // cheapest active offer
  preferredOffer: CatalogOffer | null; // the pinned offer, if any
  surfacedOffer: CatalogOffer | null; // preferred ?? best
  surfacedPrice: number; // surfacedOffer?.unitPrice ?? item.unitPrice
  surfacedSupplierId: string | null;
  surfacedSupplierName: string;
  priceUpdatedAt: string; // surfaced offer's stamp, else the item's
};

// ---------------------------------------------------------------------------
// Row shapes (snake_case; mirror 20260610000000_catalog_multi_supplier.sql)
// ---------------------------------------------------------------------------

export type SupplierRow = {
  id: string;
  name: string;
  website: string | null;
  cart_config: Record<string, unknown> | null;
  contact_id: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OfferRow = {
  id: string;
  item_id: string;
  supplier_id: string;
  unit_price: number | string;
  product_url: string | null;
  sku: string | null;
  is_preferred: boolean;
  cart_meta: Record<string, unknown> | null;
  active: boolean;
  price_updated_at: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

// Postgres `numeric` can arrive as a string; normalize to number.
function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Supplier
// ---------------------------------------------------------------------------

export function rowToSupplier(r: SupplierRow): CatalogSupplier {
  return {
    id: r.id,
    name: r.name ?? "",
    website: r.website ?? undefined,
    cartConfig: r.cart_config ?? {},
    contactId: r.contact_id ?? undefined,
    notes: r.notes ?? undefined,
  };
}

export function supplierToRow(s: CatalogSupplier): SupplierRow {
  return {
    id: s.id,
    name: s.name,
    website: s.website ?? null,
    cart_config: s.cartConfig ?? {},
    contact_id: s.contactId ?? null,
    notes: s.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

export function rowToOffer(r: OfferRow): CatalogOffer {
  return {
    id: r.id,
    itemId: r.item_id,
    supplierId: r.supplier_id,
    unitPrice: toNum(r.unit_price),
    productUrl: r.product_url ?? undefined,
    sku: r.sku ?? undefined,
    isPreferred: r.is_preferred,
    cartMeta: r.cart_meta ?? {},
    active: r.active,
    priceUpdatedAt: r.price_updated_at,
    notes: r.notes ?? undefined,
  };
}

export function offerToRow(o: CatalogOffer): OfferRow {
  return {
    id: o.id,
    item_id: o.itemId,
    supplier_id: o.supplierId,
    unit_price: o.unitPrice,
    product_url: o.productUrl ?? null,
    sku: o.sku ?? null,
    is_preferred: o.isPreferred,
    cart_meta: o.cartMeta ?? {},
    active: o.active,
    price_updated_at: o.priceUpdatedAt,
    notes: o.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Surfaced-offer resolution (pure)
// ---------------------------------------------------------------------------

/** Cheapest active offer, or null. Offers share the item's unit, so this is a
 *  valid numeric comparison. */
export function cheapestActive(offers: CatalogOffer[]): CatalogOffer | null {
  let best: CatalogOffer | null = null;
  for (const o of offers) {
    if (!o.active) continue;
    if (best === null || o.unitPrice < best.unitPrice) best = o;
  }
  return best;
}

/** The offer whose price the item surfaces: pinned preferred if any, else the
 *  cheapest active offer, else null (caller falls back to the item's inline
 *  unit_price). */
export function pickSurfacedOffer(offers: CatalogOffer[]): CatalogOffer | null {
  const preferred = offers.find((o) => o.active && o.isPreferred);
  return preferred ?? cheapestActive(offers);
}

// ---------------------------------------------------------------------------
// Assemble flat row sets -> item views
// ---------------------------------------------------------------------------

const byPriceAsc = (a: CatalogOffer, b: CatalogOffer) => a.unitPrice - b.unitPrice;

export function assembleCatalog(
  items: CatalogItem[],
  offers: CatalogOffer[],
  suppliers: CatalogSupplier[]
): CatalogItemView[] {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const activeOffersByItem = new Map<string, CatalogOffer[]>();
  for (const o of offers) {
    if (!o.active) continue;
    const list = activeOffersByItem.get(o.itemId) ?? [];
    list.push(o);
    activeOffersByItem.set(o.itemId, list);
  }

  return items.map((item) => {
    const itemOffers = (activeOffersByItem.get(item.id) ?? []).slice().sort(byPriceAsc);
    const bestOffer = cheapestActive(itemOffers);
    const preferredOffer = itemOffers.find((o) => o.isPreferred) ?? null;
    const surfacedOffer = preferredOffer ?? bestOffer;
    return {
      ...item,
      offers: itemOffers,
      bestOffer,
      preferredOffer,
      surfacedOffer,
      surfacedPrice: surfacedOffer?.unitPrice ?? item.unitPrice,
      surfacedSupplierId: surfacedOffer?.supplierId ?? null,
      surfacedSupplierName: surfacedOffer ? (supplierName.get(surfacedOffer.supplierId) ?? "") : "",
      priceUpdatedAt: surfacedOffer?.priceUpdatedAt ?? item.priceUpdatedAt,
    };
  });
}
