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

// ─── The unified library ────────────────────────────────────────────────
//
// One table, one type. Every line the shop prices off — a sheet of ply, a
// box of hinges, a reface door grid, a spray finish, a delivery service —
// is a CatalogItem distinguished by `kind`. Pricing that varies in more
// than one dimension (reface species × style grids) rides in `pricing`;
// kind-specific metadata rides in `attributes`. Estimator and Reface read
// from here.

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
  supplier: string;
  link?: string; // supplier / product page URL
  section: SectionId | null; // estimator section, when section-bound
  unit: Unit;
  unitPrice: number; // simple / base price
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
// over CatalogItem so nothing downstream had to change when the model
// unified.
export type Material = {
  id: string;
  name: string;
  supplier: string;
  unit: Unit;
  unitPrice: number;
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
  unitPrice: number; // $/sqft of sprayed area
  priceUpdatedAt: string;
  notes?: string;
};

const NOW = () => new Date().toISOString();

// The material-like kinds the Materials tab and the estimator treat as
// pickable goods (everything physical that isn't a spray finish).
const MATERIAL_KINDS: CatalogKind[] = ["material", "hardware", "door", "insert"];

// ─── Seed: a structural library exercising every kind ───────────────────
// Real prices/links are Andrew's to fill in — these prove the model end to
// end (multi-kind rows, links, matrix pricing, metadata) and keep the book
// from ever rendering blank.

const SEED_ITEMS: CatalogItem[] = [
  // Casework sheet goods
  item("m-bb18", "material", "Baltic birch ply 18mm — 4×8 sheet", {
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 195,
    section: "casework",
  }),
  item("m-mdf18", "material", "MDF 18mm (paint grade) — 4×8 sheet", {
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 96,
    section: "casework",
  }),
  item("m-mel18", "material", "Melamine 18mm white — 4×8 sheet", {
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 72,
    section: "casework",
  }),
  // Doors
  item("m-maple-shaker", "door", "Maple shaker door", {
    supplier: "Cabinetdoors.com",
    unit: "sqft",
    unitPrice: 42,
    section: "doors",
    notes: "5-piece frame, paint or stain grade",
  }),
  item("m-mdf-slab", "door", "MDF slab door (paint grade)", {
    supplier: "Cabinetdoors.com",
    unit: "sqft",
    unitPrice: 28,
    section: "doors",
  }),
  item("m-walnut-slab", "door", "Walnut slab veneered", {
    supplier: "Independent Lumber",
    unit: "sqft",
    unitPrice: 68,
    section: "doors",
    defaultWastePct: 5,
  }),
  // Finishing sprays (as materials, for the estimator's Finishing section)
  item("m-2k-clear", "material", "2K poly — clear satin (3 coats)", {
    supplier: "Akzo / in-house spray",
    unit: "sqft",
    unitPrice: 8.5,
    section: "finishing",
  }),
  item("m-2k-paint", "material", "2K poly — solid colour (primer + 3 coats)", {
    supplier: "Akzo / in-house spray",
    unit: "sqft",
    unitPrice: 11,
    section: "finishing",
  }),
  // Face components
  item("m-face-mdf", "material", "Face MDF (toekicks, fillers, scribes)", {
    supplier: "Windsor Plywood",
    unit: "sqft",
    unitPrice: 3.5,
    section: "face",
    defaultWastePct: 10,
    notes: "CNC'd by Toolpath alongside casework",
  }),

  // Finishes (own tab; coats live in attributes)
  finishItem("f1", "2K poly — clear satin", 3, 8.5),
  finishItem("f2", "2K poly — solid colour", 4, 11, "primer + 3 colour coats"),
  finishItem("f3", "Conversion varnish — clear", 2, 6),
  finishItem("f4", "Hardwax oil — Rubio", 2, 9.5, "low-VOC, on-site touch up easy"),

  // ─ New kinds — structural placeholders proving the model ─
  item("hw-blum-hinge", "hardware", "Blum BLUMOTION 110° hinge — soft close", {
    supplier: "Frameware Hardware",
    unit: "ea",
    unitPrice: 4.25,
    section: "doors",
    link: "https://www.frameware.ca",
    attributes: { finish: "nickel", overlay: "full" },
    notes: "placeholder price — confirm",
  }),
  item("hw-blum-slide", "hardware", "Blum TANDEM undermount slide 18in", {
    supplier: "Frameware Hardware",
    unit: "ea",
    unitPrice: 22,
    section: "casework",
    link: "https://www.frameware.ca",
    notes: "placeholder price — confirm",
  }),
  item("door-ns-maple", "door", "Reface door — Maple paint grade (New Surrey matrix)", {
    supplier: "New Surrey Cabinet Doors",
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
    supplier: "Frameware Hardware",
    unit: "ea",
    unitPrice: 38,
    section: "casework",
    link: "https://www.frameware.ca",
    notes: "placeholder price — confirm",
  }),
  item("svc-delivery-local", "service", "Local delivery — flat", {
    supplier: "Good Woods",
    unit: "ea",
    unitPrice: 150,
    section: "delivery",
    notes: "structural placeholder — service-kind surfacing is Phase 2",
  }),
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
    supplier: opts.supplier ?? "",
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
    supplier: "",
    unit: "sqft",
    unitPrice,
    section: "finishing",
    attributes: { coats },
    notes,
  });
}

const TABLE = "catalog_items";
const LS_KEY = "gw_catalog_v1";
const SCHEMA = 3;

// ─── Row mapping ────────────────────────────────────────────────────────

type ItemRow = {
  id: string;
  kind: CatalogKind;
  name: string;
  supplier: string;
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
    supplier: r.supplier,
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
    supplier: i.supplier,
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

// ─── Back-compat projections ────────────────────────────────────────────

function toMaterial(i: CatalogItem): Material {
  return {
    id: i.id,
    name: i.name,
    supplier: i.supplier,
    unit: i.unit,
    unitPrice: i.unitPrice,
    section: (i.section ?? "casework") as SectionId,
    defaultWastePct: i.defaultWastePct,
    defaultMarkupPct: i.defaultMarkupPct,
    priceUpdatedAt: i.priceUpdatedAt,
    notes: i.notes,
  };
}

function toFinish(i: CatalogItem): Finish {
  return {
    id: i.id,
    name: i.name,
    coats: Number(i.attributes?.coats ?? 2),
    unitPrice: i.unitPrice,
    priceUpdatedAt: i.priceUpdatedAt,
    notes: i.notes,
  };
}

// ─── localStorage fallback (with v2 → v3 migration) ─────────────────────

type PersistedV3 = { schema: 3; items: CatalogItem[] };
// Loose shape covering both the current v3 blob and the older v2
// { materials, finishes } blob we migrate from.
type PersistedAny = {
  schema?: number;
  items?: CatalogItem[];
  materials?: Material[];
  finishes?: Finish[];
};

function localLoad(): CatalogItem[] {
  if (typeof window === "undefined") return SEED_ITEMS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return SEED_ITEMS;
    const parsed = JSON.parse(raw) as PersistedAny;
    if (parsed.schema === 3 && Array.isArray(parsed.items)) {
      return parsed.items as CatalogItem[];
    }
    // Migrate an older { materials, finishes } blob into unified items.
    if (Array.isArray(parsed.materials) || Array.isArray(parsed.finishes)) {
      const mats = (parsed.materials ?? []).map((m) =>
        item(m.id, "material", m.name, {
          supplier: m.supplier,
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
      const merged = [...mats, ...fins];
      return merged.length > 0 ? merged : SEED_ITEMS;
    }
    return SEED_ITEMS;
  } catch {
    return SEED_ITEMS;
  }
}

function localSave(items: CatalogItem[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedV3 = { schema: SCHEMA, items };
    window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* silent */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function logPriceChange(i: CatalogItem) {
  import("./priceHistory")
    .then((mod) =>
      mod.logPrice({
        materialId: i.id,
        supplier: i.supplier,
        unitPrice: i.unitPrice,
        source: "manual",
      })
    )
    .catch(() => {});
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

// ─── Context ────────────────────────────────────────────────────────────

type CatalogContextValue = {
  items: CatalogItem[]; // active items, the whole library
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
  reset: () => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const [all, setAll] = useState<CatalogItem[]>(SEED_ITEMS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allRef = useRef<CatalogItem[]>(SEED_ITEMS);
  useEffect(() => {
    allRef.current = all;
  }, [all]);

  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Initial load (seeds an empty DB so the library is never blank).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        const loaded = localLoad();
        if (!cancelled) {
          setAll(loaded);
          setLoading(false);
        }
        return;
      }
      try {
        const sb = getSupabase();
        const { data, error: qErr } = await sb.from(TABLE).select("*");
        if (qErr) throw qErr;
        let items = (data as ItemRow[] | null)?.map(rowToItem) ?? [];
        if (items.length === 0) {
          await sb.from(TABLE).insert(SEED_ITEMS.map(itemToRow));
          items = SEED_ITEMS;
        }
        if (!cancelled) {
          setAll(items.sort(byName));
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
    if (!loading && backend === "localStorage") localSave(all);
  }, [all, loading, backend]);

  // Debounced per-row writer for inline edits.
  const scheduleFlush = useCallback(
    (id: string, run: () => void) => {
      if (backend !== "supabase") return;
      const timers = pending.current;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => {
          run();
          timers.delete(id);
        }, 600)
      );
    },
    [backend]
  );

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
            logPriceChange(next);
          }
          return next;
        })
      );
      scheduleFlush(id, () => {
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

  // Soft-delete: flip active off so estimates/jobs that reference the item
  // can still resolve its name + last price, but it drops out of the book.
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

  // ─ Back-compat material/finish ops over the unified store ─
  const addMaterial = useCallback(
    (m: Omit<Material, "id" | "priceUpdatedAt">) =>
      addItem({
        kind: "material",
        name: m.name,
        supplier: m.supplier,
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
    (id: string, patch: Partial<Material>) => updateItem(id, patch as Partial<CatalogItem>),
    [updateItem]
  );

  const removeMaterial = removeItem;

  const addFinish = useCallback(
    (f: Omit<Finish, "id" | "priceUpdatedAt">) =>
      addItem({
        kind: "finish",
        name: f.name,
        supplier: "",
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
    if (backend === "supabase") {
      const sb = getSupabase();
      void (async () => {
        await sb.from(TABLE).delete().neq("id", "");
        await sb.from(TABLE).insert(SEED_ITEMS.map(itemToRow));
      })();
    }
  }, [backend]);

  const activeItems = useMemo(() => all.filter((i) => i.active), [all]);

  const materials = useMemo(
    () => activeItems.filter((i) => MATERIAL_KINDS.includes(i.kind) && i.section).map(toMaterial),
    [activeItems]
  );
  const finishes = useMemo(
    () => activeItems.filter((i) => i.kind === "finish").map(toFinish),
    [activeItems]
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      items: activeItems,
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
      reset,
    }),
    [
      activeItems,
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
