"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Unit } from "@features/estimator/lib/types";
import type { SectionId } from "@features/estimator/lib/sections";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import {
  assembleCatalog,
  offerToRow,
  rowToOffer,
  rowToSupplier,
  supplierToRow,
  OFFERS_TABLE,
  SUPPLIERS_TABLE,
  type CatalogItemView,
  type CatalogOffer,
  type CatalogSupplier,
  type OfferRow,
  type SupplierRow,
} from "./catalogRowMap";

export type { CatalogItemView, CatalogOffer, CatalogSupplier } from "./catalogRowMap";

// ─── The unified library ────────────────────────────────────────────────
//
// One table, one type. Every line the shop prices off — a sheet of ply, a
// box of hinges, a reface door grid, a spray finish, a delivery service —
// is a CatalogItem distinguished by `kind`. Pricing that varies in more
// than one dimension (reface species × style grids) rides in `pricing`;
// kind-specific metadata rides in `attributes`.
//
// Phase 2: procured kinds (material/hardware/door/insert) carry many
// supplier *offers* (catalogRowMap.ts); the surfaced price = preferred ??
// cheapest active offer ?? this item's inline unit_price. In-house kinds
// (finish/labour/service) have no offers and keep their inline price.
// See docs/decisions/0006-catalog-items-vs-offers.md.

export type CatalogKind =
  | "material" // sheet goods, lumber, sprays — the bulk of the book
  | "hardware" // hinges, slides, pulls, fasteners
  | "door" // door / drawer fronts (may carry matrix pricing)
  | "finish" // spray finishes, priced by sqft
  | "insert" // drawer organisers, cutlery trays, pull-outs
  | "labour" // labour line definitions
  | "service"; // flat-rate services (delivery, sub-out)

export type CatalogItem = {
  id: string;
  kind: CatalogKind;
  name: string;
  link?: string; // item-level spec / manufacturer page (distinct from an offer's buy URL)
  section: SectionId | null; // estimator section, when section-bound
  unit: Unit;
  unitPrice: number; // inline price: the surfaced fallback when there are no offers
  pricing?: unknown; // matrix or tiered pricing (jsonb passthrough); null = simple
  attributes: Record<string, unknown>; // kind-specific metadata
  defaultWastePct?: number;
  defaultMarkupPct?: number;
  active: boolean; // soft-delete: false keeps the row resolvable but out of the list
  priceUpdatedAt: string; // ISO timestamp
  notes?: string;
};

// Back-compat projections. The Materials and Finishes tables, the
// estimator, and inventory all speak these shapes; they are derived views
// over the surfaced offer so nothing downstream changed when offers landed.
export type Material = {
  id: string;
  name: string;
  supplier: string; // surfaced offer's supplier name ("" when no offer)
  unit: Unit;
  unitPrice: number; // surfaced price
  section: SectionId;
  defaultWastePct?: number;
  defaultMarkupPct?: number;
  priceUpdatedAt: string;
  notes?: string;
};

export type Finish = {
  id: string;
  name: string;
  coats: number;
  unitPrice: number; // $/sqft of sprayed area (inline — finishes have no offers)
  priceUpdatedAt: string;
  notes?: string;
};

const NOW = () => new Date().toISOString();
const newId = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const newUuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

// The material-like kinds the Materials tab and the estimator treat as
// pickable goods (everything physical that isn't a spray finish). These are
// exactly the procured kinds that carry offers.
const MATERIAL_KINDS: CatalogKind[] = ["material", "hardware", "door", "insert"];

// ─── Seed: a structural library exercising every kind ───────────────────
// Real prices/links/suppliers are Andrew's to fill in — these prove the model
// end to end (multi-kind rows, links, matrix pricing, metadata, and the
// multi-supplier offer mechanics) and keep the book from ever rendering blank.

const SEED_ITEMS: CatalogItem[] = [
  // Casework sheet goods
  item("m-bb18", "material", "Baltic birch ply 18mm — 4×8 sheet", {
    unit: "ea",
    unitPrice: 195,
    section: "casework",
  }),
  item("m-mdf18", "material", "MDF 18mm (paint grade) — 4×8 sheet", {
    unit: "ea",
    unitPrice: 96,
    section: "casework",
  }),
  item("m-mel18", "material", "Melamine 18mm white — 4×8 sheet", {
    unit: "ea",
    unitPrice: 72,
    section: "casework",
  }),
  // Doors
  item("m-maple-shaker", "door", "Maple shaker door", {
    unit: "sqft",
    unitPrice: 42,
    section: "doors",
    notes: "5-piece frame, paint or stain grade",
  }),
  item("m-mdf-slab", "door", "MDF slab door (paint grade)", {
    unit: "sqft",
    unitPrice: 28,
    section: "doors",
  }),
  item("m-walnut-slab", "door", "Walnut slab veneered", {
    unit: "sqft",
    unitPrice: 68,
    section: "doors",
    defaultWastePct: 5,
  }),
  // Finishing sprays (as materials, for the estimator's Finishing section).
  // Left offer-less on purpose — surfaced price falls back to the inline price.
  item("m-2k-clear", "material", "2K poly — clear satin (3 coats)", {
    unit: "sqft",
    unitPrice: 8.5,
    section: "finishing",
  }),
  item("m-2k-paint", "material", "2K poly — solid colour (primer + 3 coats)", {
    unit: "sqft",
    unitPrice: 11,
    section: "finishing",
  }),
  // Face components
  item("m-face-mdf", "material", "Face MDF (toekicks, fillers, scribes)", {
    unit: "sqft",
    unitPrice: 3.5,
    section: "face",
    defaultWastePct: 10,
    notes: "CNC'd by Toolpath alongside casework",
  }),

  // Finishes (own tab; coats live in attributes; no offers — in-house rate)
  finishItem("f1", "2K poly — clear satin", 3, 8.5),
  finishItem("f2", "2K poly — solid colour", 4, 11, "primer + 3 colour coats"),
  finishItem("f3", "Conversion varnish — clear", 2, 6),
  finishItem("f4", "Hardwax oil — Rubio", 2, 9.5, "low-VOC, on-site touch up easy"),

  // ─ New kinds — structural placeholders proving the model ─
  item("hw-blum-hinge", "hardware", "Blum BLUMOTION 110° hinge — soft close", {
    unit: "ea",
    unitPrice: 4.25,
    section: "doors",
    link: "https://www.frameware.ca",
    attributes: { finish: "nickel", overlay: "full" },
    notes: "placeholder price — confirm",
  }),
  item("hw-blum-slide", "hardware", "Blum TANDEM undermount slide 18in", {
    unit: "ea",
    unitPrice: 22,
    section: "casework",
    link: "https://www.frameware.ca",
    notes: "placeholder price — confirm",
  }),
  item("door-ns-maple", "door", "Reface door — Maple paint grade (New Surrey matrix)", {
    unit: "sqft",
    unitPrice: 12.5,
    section: "doors",
    link: "https://www.newsurreycabinetdoors.com",
    // Sample 2-D grid — Phase 2 folds the full New Surrey book in here and
    // teaches Reface to read it instead of its hardcoded price book.
    pricing: {
      basis: "sqft",
      dimensions: ["style"],
      grid: { slab: 12.5, shaker: 14.5, "raised-panel": 17.0 },
    },
    notes: "matrix pricing sample — Phase 2",
  }),
  item("in-cutlery", "insert", "Cutlery drawer insert — maple", {
    unit: "ea",
    unitPrice: 38,
    section: "casework",
    link: "https://www.frameware.ca",
    notes: "placeholder price — confirm",
  }),
  item("svc-delivery-local", "service", "Local delivery — flat", {
    unit: "ea",
    unitPrice: 150,
    section: "delivery",
    notes: "structural placeholder — service-kind surfacing is Phase 2",
  }),
];

// Stable seed suppliers (literal UUIDs so re-seeds are idempotent).
const S_WINDSOR = "11111111-1111-1111-1111-111111111101";
const S_INDEPENDENT = "11111111-1111-1111-1111-111111111102";
const S_NEWSURREY = "11111111-1111-1111-1111-111111111103";
const S_FRAMEWARE = "11111111-1111-1111-1111-111111111104";
const S_CABINETDOORS = "11111111-1111-1111-1111-111111111105";

const SEED_SUPPLIERS: CatalogSupplier[] = [
  supplier(S_WINDSOR, "Windsor Plywood", "https://www.windsorplywood.com"),
  supplier(S_INDEPENDENT, "Independent Lumber"),
  supplier(S_NEWSURREY, "New Surrey Cabinet Doors", "https://www.newsurreycabinetdoors.com"),
  supplier(S_FRAMEWARE, "Frameware Hardware", "https://www.frameware.ca"),
  supplier(S_CABINETDOORS, "Cabinetdoors.com", "https://www.cabinetdoors.com"),
];

// Seed offers. Two demonstrators on purpose:
//   • m-mdf18 has two offers (Windsor $96 vs cheaper Independent $89) → "← best".
//   • m-walnut-slab pins a preferred that is NOT the cheapest (New Surrey $74
//     preferred over Independent $68) → "★ preferred" overriding cheapest.
const SEED_OFFERS: CatalogOffer[] = [
  offer("m-bb18", S_WINDSOR, 195),
  offer("m-mdf18", S_WINDSOR, 96),
  offer("m-mdf18", S_INDEPENDENT, 89),
  offer("m-mel18", S_WINDSOR, 72),
  offer("m-maple-shaker", S_CABINETDOORS, 42),
  offer("m-mdf-slab", S_CABINETDOORS, 28),
  offer("m-walnut-slab", S_INDEPENDENT, 68),
  offer("m-walnut-slab", S_NEWSURREY, 74, {
    isPreferred: true,
    notes: "preferred — better veneer match, worth the premium",
  }),
  offer("m-face-mdf", S_WINDSOR, 3.5),
  offer("hw-blum-hinge", S_FRAMEWARE, 4.25, { productUrl: "https://www.frameware.ca" }),
  offer("hw-blum-slide", S_FRAMEWARE, 22, { productUrl: "https://www.frameware.ca" }),
  offer("door-ns-maple", S_NEWSURREY, 12.5, {
    productUrl: "https://www.newsurreycabinetdoors.com",
  }),
  offer("in-cutlery", S_FRAMEWARE, 38, { productUrl: "https://www.frameware.ca" }),
];

// Small builders to keep the seed readable.
function item(
  id: string,
  kind: CatalogKind,
  name: string,
  opts: Partial<Omit<CatalogItem, "id" | "kind" | "name">>
): CatalogItem {
  return {
    id,
    kind,
    name,
    link: opts.link,
    section: opts.section ?? null,
    unit: opts.unit ?? "ea",
    unitPrice: opts.unitPrice ?? 0,
    pricing: opts.pricing,
    attributes: opts.attributes ?? {},
    defaultWastePct: opts.defaultWastePct ?? 0,
    defaultMarkupPct: opts.defaultMarkupPct ?? 35,
    active: true,
    priceUpdatedAt: NOW(),
    notes: opts.notes,
  };
}

function finishItem(
  id: string,
  name: string,
  coats: number,
  unitPrice: number,
  notes?: string
): CatalogItem {
  return item(id, "finish", name, {
    unit: "sqft",
    unitPrice,
    section: "finishing",
    attributes: { coats },
    notes,
  });
}

function supplier(id: string, name: string, website?: string): CatalogSupplier {
  return { id, name, website, cartConfig: {}, notes: undefined };
}

function offer(
  itemId: string,
  supplierId: string,
  unitPrice: number,
  opts: Partial<Omit<CatalogOffer, "id" | "itemId" | "supplierId" | "unitPrice">> = {}
): CatalogOffer {
  return {
    id: newUuid(),
    itemId,
    supplierId,
    unitPrice,
    productUrl: opts.productUrl,
    sku: opts.sku,
    isPreferred: opts.isPreferred ?? false,
    cartMeta: opts.cartMeta ?? {},
    active: opts.active ?? true,
    priceUpdatedAt: NOW(),
    notes: opts.notes,
  };
}

const TABLE = "catalog_items";
const LS_KEY = "gw_catalog_v1";
const SCHEMA = 4;

// ─── Row mapping (items) ────────────────────────────────────────────────

type ItemRow = {
  id: string;
  kind: CatalogKind;
  name: string;
  link: string | null;
  section: SectionId | null;
  unit: Unit;
  unit_price: number;
  pricing: unknown | null;
  attributes: Record<string, unknown> | null;
  default_waste_pct: number;
  default_markup_pct: number;
  active: boolean;
  price_updated_at: string;
  notes: string | null;
};

function rowToItem(r: ItemRow): CatalogItem {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    link: r.link ?? undefined,
    section: r.section,
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    pricing: r.pricing ?? undefined,
    attributes: r.attributes ?? {},
    defaultWastePct: Number(r.default_waste_pct),
    defaultMarkupPct: Number(r.default_markup_pct),
    active: r.active,
    priceUpdatedAt: r.price_updated_at,
    notes: r.notes ?? undefined,
  };
}

function itemToRow(i: CatalogItem): ItemRow {
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    link: i.link ?? null,
    section: i.section,
    unit: i.unit,
    unit_price: i.unitPrice,
    pricing: i.pricing ?? null,
    attributes: i.attributes ?? {},
    default_waste_pct: i.defaultWastePct ?? 0,
    default_markup_pct: i.defaultMarkupPct ?? 35,
    active: i.active,
    price_updated_at: i.priceUpdatedAt,
    notes: i.notes ?? null,
  };
}

// ─── Back-compat projections (over the surfaced offer) ──────────────────

function toMaterial(v: CatalogItemView): Material {
  return {
    id: v.id,
    name: v.name,
    supplier: v.surfacedSupplierName,
    unit: v.unit,
    unitPrice: v.surfacedPrice,
    section: (v.section ?? "casework") as SectionId,
    defaultWastePct: v.defaultWastePct,
    defaultMarkupPct: v.defaultMarkupPct,
    priceUpdatedAt: v.priceUpdatedAt,
    notes: v.notes,
  };
}

function toFinish(v: CatalogItemView): Finish {
  return {
    id: v.id,
    name: v.name,
    coats: Number(v.attributes?.coats ?? 2),
    unitPrice: v.surfacedPrice, // == inline price; finishes have no offers
    priceUpdatedAt: v.priceUpdatedAt,
    notes: v.notes,
  };
}

// ─── localStorage fallback (with v3 → v4 migration) ─────────────────────

type PersistedV4 = {
  schema: 4;
  items: CatalogItem[];
  suppliers: CatalogSupplier[];
  offers: CatalogOffer[];
};
// Loose shape covering the v4 blob, the older v3 { schema, items } blob (items
// carried an inline `supplier`), and the oldest v2 { materials, finishes } blob.
type PersistedAny = {
  schema?: number;
  items?: (CatalogItem & { supplier?: string })[];
  suppliers?: CatalogSupplier[];
  offers?: CatalogOffer[];
  materials?: {
    id: string;
    name: string;
    supplier?: string;
    unit: Unit;
    unitPrice: number;
    section: SectionId;
    defaultWastePct?: number;
    defaultMarkupPct?: number;
    notes?: string;
  }[];
  finishes?: { id: string; name: string; coats: number; unitPrice: number; notes?: string }[];
};

type LocalState = { items: CatalogItem[]; suppliers: CatalogSupplier[]; offers: CatalogOffer[] };

const SEED_STATE: LocalState = {
  items: SEED_ITEMS,
  suppliers: SEED_SUPPLIERS,
  offers: SEED_OFFERS,
};

// Wrap an inline supplier+price (from a pre-offers blob) into one offer, minting
// a supplier per distinct name so local-only edits aren't lost on upgrade.
function wrapInlineOffers(rows: { id: string; supplier?: string; unitPrice: number }[]): {
  suppliers: CatalogSupplier[];
  offers: CatalogOffer[];
} {
  const byName = new Map<string, CatalogSupplier>();
  const offers: CatalogOffer[] = [];
  for (const r of rows) {
    const name = (r.supplier ?? "").trim();
    if (!name) continue;
    let s = byName.get(name.toLowerCase());
    if (!s) {
      s = supplier(newUuid(), name);
      byName.set(name.toLowerCase(), s);
    }
    offers.push(offer(r.id, s.id, r.unitPrice));
  }
  return { suppliers: Array.from(byName.values()), offers };
}

function localLoad(): LocalState {
  if (typeof window === "undefined") return SEED_STATE;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return SEED_STATE;
    const parsed = JSON.parse(raw) as PersistedAny;

    if (parsed.schema === 4 && Array.isArray(parsed.items)) {
      return {
        items: parsed.items as CatalogItem[],
        suppliers: parsed.suppliers ?? [],
        offers: parsed.offers ?? [],
      };
    }
    // v3 → v4: items carried an inline `supplier`; wrap those into offers.
    if (parsed.schema === 3 && Array.isArray(parsed.items)) {
      const items = parsed.items.map((i) => {
        const { supplier: _drop, ...rest } = i;
        return rest as CatalogItem;
      });
      const procured = parsed.items.filter((i) => MATERIAL_KINDS.includes(i.kind));
      const { suppliers, offers } = wrapInlineOffers(
        procured as { id: string; supplier?: string; unitPrice: number }[]
      );
      return items.length > 0 ? { items, suppliers, offers } : SEED_STATE;
    }
    // v2 { materials, finishes } → unified items + wrapped offers.
    if (Array.isArray(parsed.materials) || Array.isArray(parsed.finishes)) {
      const mats = (parsed.materials ?? []).map((m) =>
        item(m.id, "material", m.name, {
          unit: m.unit,
          unitPrice: m.unitPrice,
          section: m.section,
          defaultWastePct: m.defaultWastePct,
          defaultMarkupPct: m.defaultMarkupPct,
          notes: m.notes,
        })
      );
      const fins = (parsed.finishes ?? []).map((f) =>
        finishItem(f.id, f.name, f.coats, f.unitPrice, f.notes)
      );
      const { suppliers, offers } = wrapInlineOffers(parsed.materials ?? []);
      const items = [...mats, ...fins];
      return items.length > 0 ? { items, suppliers, offers } : SEED_STATE;
    }
    return SEED_STATE;
  } catch {
    return SEED_STATE;
  }
}

function localSave(state: LocalState) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedV4 = { schema: SCHEMA, ...state };
    window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* silent */
  }
}

// Fire-and-forget price-history append on a price change.
function logItemPriceChange(i: CatalogItem) {
  import("./priceHistory")
    .then((mod) =>
      mod.logPrice({ itemId: i.id, supplier: "", unitPrice: i.unitPrice, source: "manual" })
    )
    .catch(() => {});
}

function logOfferPriceChange(o: CatalogOffer, supplierName: string) {
  import("./priceHistory")
    .then((mod) =>
      mod.logPrice({
        itemId: o.itemId,
        offerId: o.id,
        supplier: supplierName,
        unitPrice: o.unitPrice,
        source: "manual",
      })
    )
    .catch(() => {});
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

// ─── Context ────────────────────────────────────────────────────────────

type CatalogContextValue = {
  items: CatalogItem[]; // active items, the whole library
  itemsWithOffers: CatalogItemView[]; // active items + stitched offers + surfaced offer
  suppliers: CatalogSupplier[];
  materials: Material[]; // material-like kinds with a section (back-compat)
  finishes: Finish[]; // finish kind (back-compat)
  loading: boolean;
  error: string | null;
  addItem: (i: Omit<CatalogItem, "id" | "priceUpdatedAt" | "active">) => void;
  updateItem: (id: string, patch: Partial<CatalogItem>) => void;
  removeItem: (id: string) => void;
  addMaterial: (m: Omit<Material, "id" | "priceUpdatedAt">) => void;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  removeMaterial: (id: string) => void;
  addFinish: (f: Omit<Finish, "id" | "priceUpdatedAt">) => void;
  updateFinish: (id: string, patch: Partial<Finish>) => void;
  removeFinish: (id: string) => void;
  // Suppliers & offers (procured kinds)
  addSupplier: (name: string) => Promise<string>; // find-or-create → supplier id
  updateSupplier: (id: string, patch: Partial<CatalogSupplier>) => void;
  removeSupplier: (id: string) => void;
  addOffer: (itemId: string, supplierId: string, unitPrice?: number) => void;
  updateOffer: (id: string, patch: Partial<CatalogOffer>) => void;
  removeOffer: (id: string) => void;
  setPreferredOffer: (itemId: string, offerId: string | null) => void;
  reset: () => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const [all, setAll] = useState<CatalogItem[]>(SEED_ITEMS);
  const [suppliers, setSuppliers] = useState<CatalogSupplier[]>(SEED_SUPPLIERS);
  const [offers, setOffers] = useState<CatalogOffer[]>(SEED_OFFERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allRef = useRef<CatalogItem[]>(SEED_ITEMS);
  const offersRef = useRef<CatalogOffer[]>(SEED_OFFERS);
  const suppliersRef = useRef<CatalogSupplier[]>(SEED_SUPPLIERS);
  useEffect(() => {
    allRef.current = all;
  }, [all]);
  useEffect(() => {
    offersRef.current = offers;
  }, [offers]);
  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Initial load (seeds an empty DB so the library is never blank, and
  // backfills seed offers/suppliers onto pre-Phase-2 items that lack them).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        const loaded = localLoad();
        if (!cancelled) {
          setAll(loaded.items);
          setSuppliers(loaded.suppliers);
          setOffers(loaded.offers);
          setLoading(false);
        }
        return;
      }
      try {
        const sb = getSupabase();
        const [itemsRes, offersRes, suppliersRes] = await Promise.all([
          sb.from(TABLE).select("*"),
          sb.from(OFFERS_TABLE).select("*"),
          sb.from(SUPPLIERS_TABLE).select("*"),
        ]);
        if (itemsRes.error) throw itemsRes.error;
        if (offersRes.error) throw offersRes.error;
        if (suppliersRes.error) throw suppliersRes.error;

        let items = (itemsRes.data as ItemRow[] | null)?.map(rowToItem) ?? [];
        let supplierList = (suppliersRes.data as SupplierRow[] | null)?.map(rowToSupplier) ?? [];
        let offerList = (offersRes.data as OfferRow[] | null)?.map(rowToOffer) ?? [];

        // Seed an empty library.
        if (items.length === 0) {
          await sb.from(TABLE).insert(SEED_ITEMS.map(itemToRow));
          items = SEED_ITEMS;
        }
        // Backfill the offer layer if it's empty (e.g. a Phase-1 DB that seeded
        // items before this migration). Only offers whose item exists are sent.
        if (supplierList.length === 0 && offerList.length === 0) {
          const itemIds = new Set(items.map((i) => i.id));
          const seedOffers = SEED_OFFERS.filter((o) => itemIds.has(o.itemId));
          if (seedOffers.length > 0) {
            await sb.from(SUPPLIERS_TABLE).insert(SEED_SUPPLIERS.map(supplierToRow));
            await sb.from(OFFERS_TABLE).insert(seedOffers.map(offerToRow));
            supplierList = SEED_SUPPLIERS;
            offerList = seedOffers;
          }
        }

        if (!cancelled) {
          setAll(items.sort(byName));
          setSuppliers(supplierList.sort(byName));
          setOffers(offerList);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave({ items: all, suppliers, offers });
  }, [all, suppliers, offers, loading, backend]);

  // Debounced per-key writer for inline edits (keys are namespaced so item and
  // offer ids never collide).
  const scheduleFlush = useCallback(
    (key: string, run: () => void) => {
      if (backend !== "supabase") return;
      const timers = pending.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          run();
          timers.delete(key);
        }, 600)
      );
    },
    [backend]
  );

  // ─ Items ─
  const addItem = useCallback(
    (input: Omit<CatalogItem, "id" | "priceUpdatedAt" | "active">) => {
      const created: CatalogItem = {
        ...input,
        id: newId(input.kind === "finish" ? "f" : "m"),
        active: true,
        priceUpdatedAt: NOW(),
      };
      setAll((prev) => [...prev, created].sort(byName));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(TABLE)
          .insert(itemToRow(created))
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<CatalogItem>) => {
      setAll((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const next = { ...i, ...patch };
          if (patch.unitPrice !== undefined && patch.unitPrice !== i.unitPrice) {
            next.priceUpdatedAt = NOW();
            logItemPriceChange(next);
          }
          return next;
        })
      );
      scheduleFlush(`item:${id}`, () => {
        const row = allRef.current.find((i) => i.id === id);
        if (!row) return;
        const sb = getSupabase();
        void sb
          .from(TABLE)
          .update(itemToRow(row))
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      });
    },
    [scheduleFlush]
  );

  // Soft-delete: flip active off so estimates/jobs that reference the item can
  // still resolve its name + last price, but it drops out of the book.
  const removeItem = useCallback(
    (id: string) => {
      setAll((prev) => prev.map((i) => (i.id === id ? { ...i, active: false } : i)));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(TABLE)
          .update({ active: false })
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  // ─ Suppliers ─
  const addSupplier = useCallback(
    async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (!trimmed) return "";
      // Find-or-create: case-insensitive match against the in-memory list first
      // (NOT a DB upsert — PostgREST can't target a lower(name) index).
      const existing = suppliersRef.current.find(
        (s) => s.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return existing.id;
      const created: CatalogSupplier = supplier(newUuid(), trimmed);
      setSuppliers((prev) => [...prev, created].sort(byName));
      if (backend === "supabase") {
        const sb = getSupabase();
        const { error: e } = await sb.from(SUPPLIERS_TABLE).insert(supplierToRow(created));
        if (e) setError(formatError(e));
      }
      return created.id;
    },
    [backend]
  );

  const updateSupplier = useCallback(
    (id: string, patch: Partial<CatalogSupplier>) => {
      setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      scheduleFlush(`supplier:${id}`, () => {
        const row = suppliersRef.current.find((s) => s.id === id);
        if (!row) return;
        const sb = getSupabase();
        void sb
          .from(SUPPLIERS_TABLE)
          .update(supplierToRow(row))
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      });
    },
    [scheduleFlush]
  );

  const removeSupplier = useCallback(
    (id: string) => {
      // FK is `on delete restrict`; only removable when no offer references it.
      const inUse = offersRef.current.some((o) => o.supplierId === id);
      if (inUse) {
        setError("Can't delete a supplier that still has offers. Remove its offers first.");
        return;
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(SUPPLIERS_TABLE)
          .delete()
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  // ─ Offers ─
  const addOffer = useCallback(
    (itemId: string, supplierId: string, unitPrice = 0) => {
      const created = offer(itemId, supplierId, unitPrice);
      setOffers((prev) => [...prev, created]);
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(OFFERS_TABLE)
          .insert(offerToRow(created))
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  const updateOffer = useCallback(
    (id: string, patch: Partial<CatalogOffer>) => {
      setOffers((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const next = { ...o, ...patch };
          if (patch.unitPrice !== undefined && patch.unitPrice !== o.unitPrice) {
            next.priceUpdatedAt = NOW();
            const sName = suppliersRef.current.find((s) => s.id === next.supplierId)?.name ?? "";
            logOfferPriceChange(next, sName);
          }
          return next;
        })
      );
      scheduleFlush(`offer:${id}`, () => {
        const row = offersRef.current.find((o) => o.id === id);
        if (!row) return;
        const sb = getSupabase();
        void sb
          .from(OFFERS_TABLE)
          .update(offerToRow(row))
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      });
    },
    [scheduleFlush]
  );

  // Soft-delete an offer.
  const removeOffer = useCallback(
    (id: string) => {
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, active: false } : o)));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(OFFERS_TABLE)
          .update({ active: false })
          .eq("id", id)
          .then(({ error: e }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  // Pin (or clear, with offerId=null) the preferred offer for an item. The DB
  // partial unique index forbids two preferred rows, so the clear+set must be
  // atomic — done via the set_preferred_offer RPC.
  const setPreferredOffer = useCallback(
    (itemId: string, offerId: string | null) => {
      setOffers((prev) =>
        prev.map((o) =>
          o.itemId === itemId ? { ...o, isPreferred: offerId !== null && o.id === offerId } : o
        )
      );
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .rpc("set_preferred_offer", { p_item: itemId, p_offer: offerId })
          .then(({ error: e }: { error: unknown }) => e && setError(formatError(e)));
      }
    },
    [backend]
  );

  // ─ Back-compat material/finish ops over the unified store ─
  const addMaterial = useCallback(
    (m: Omit<Material, "id" | "priceUpdatedAt">) =>
      addItem({
        kind: "material",
        name: m.name,
        section: m.section,
        unit: m.unit,
        unitPrice: m.unitPrice,
        attributes: {},
        defaultWastePct: m.defaultWastePct,
        defaultMarkupPct: m.defaultMarkupPct,
        notes: m.notes,
      }),
    [addItem]
  );

  const updateMaterial = useCallback(
    (id: string, patch: Partial<Material>) => {
      // `supplier` lives on offers now; drop it from the item patch.
      const { supplier: _drop, ...rest } = patch;
      updateItem(id, rest as Partial<CatalogItem>);
    },
    [updateItem]
  );

  const removeMaterial = removeItem;

  const addFinish = useCallback(
    (f: Omit<Finish, "id" | "priceUpdatedAt">) =>
      addItem({
        kind: "finish",
        name: f.name,
        section: "finishing",
        unit: "sqft",
        unitPrice: f.unitPrice,
        attributes: { coats: f.coats },
        notes: f.notes,
      }),
    [addItem]
  );

  const updateFinish = useCallback(
    (id: string, patch: Partial<Finish>) => {
      const { coats, ...rest } = patch;
      const itemPatch: Partial<CatalogItem> = { ...rest };
      if (coats !== undefined) {
        const existing = allRef.current.find((i) => i.id === id);
        itemPatch.attributes = { ...(existing?.attributes ?? {}), coats };
      }
      updateItem(id, itemPatch);
    },
    [updateItem]
  );

  const removeFinish = removeItem;

  const reset = useCallback(() => {
    setAll(SEED_ITEMS);
    setSuppliers(SEED_SUPPLIERS);
    setOffers(SEED_OFFERS);
    if (backend === "supabase") {
      const sb = getSupabase();
      void (async () => {
        // FK-safe order: offers → suppliers + items, then re-insert.
        await sb.from(OFFERS_TABLE).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await sb.from(SUPPLIERS_TABLE).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await sb.from(TABLE).delete().neq("id", "");
        await sb.from(TABLE).insert(SEED_ITEMS.map(itemToRow));
        await sb.from(SUPPLIERS_TABLE).insert(SEED_SUPPLIERS.map(supplierToRow));
        await sb.from(OFFERS_TABLE).insert(SEED_OFFERS.map(offerToRow));
      })();
    }
  }, [backend]);

  const activeItems = useMemo(() => all.filter((i) => i.active), [all]);

  const itemsWithOffers = useMemo(
    () => assembleCatalog(activeItems, offers, suppliers),
    [activeItems, offers, suppliers]
  );

  const materials = useMemo(
    () =>
      itemsWithOffers.filter((v) => MATERIAL_KINDS.includes(v.kind) && v.section).map(toMaterial),
    [itemsWithOffers]
  );
  const finishes = useMemo(
    () => itemsWithOffers.filter((v) => v.kind === "finish").map(toFinish),
    [itemsWithOffers]
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      items: activeItems,
      itemsWithOffers,
      suppliers,
      materials,
      finishes,
      loading,
      error,
      addItem,
      updateItem,
      removeItem,
      addMaterial,
      updateMaterial,
      removeMaterial,
      addFinish,
      updateFinish,
      removeFinish,
      addSupplier,
      updateSupplier,
      removeSupplier,
      addOffer,
      updateOffer,
      removeOffer,
      setPreferredOffer,
      reset,
    }),
    [
      activeItems,
      itemsWithOffers,
      suppliers,
      materials,
      finishes,
      loading,
      error,
      addItem,
      updateItem,
      removeItem,
      addMaterial,
      updateMaterial,
      removeMaterial,
      addFinish,
      updateFinish,
      removeFinish,
      addSupplier,
      updateSupplier,
      removeSupplier,
      addOffer,
      updateOffer,
      removeOffer,
      setPreferredOffer,
      reset,
    ]
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}

export function useMaterialsBySection(): Record<SectionId, Material[]> {
  const { materials } = useCatalog();
  return useMemo(() => {
    const out: Partial<Record<SectionId, Material[]>> = {};
    for (const m of materials) {
      if (!out[m.section]) out[m.section] = [];
      out[m.section]!.push(m);
    }
    return out as Record<SectionId, Material[]>;
  }, [materials]);
}
