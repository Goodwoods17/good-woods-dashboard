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

export type Material = {
  id: string;
  name: string;
  supplier: string;
  unit: Unit;
  unitPrice: number;
  section: SectionId;
  defaultWastePct?: number;
  defaultMarkupPct?: number;
  priceUpdatedAt: string; // ISO timestamp
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

const SEED_MATERIALS: Material[] = [
  {
    id: "m-bb18",
    name: "Baltic birch ply 18mm — 4×8 sheet",
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 195,
    section: "casework",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-mdf18",
    name: "MDF 18mm (paint grade) — 4×8 sheet",
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 96,
    section: "casework",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-mel18",
    name: "Melamine 18mm white — 4×8 sheet",
    supplier: "Windsor Plywood",
    unit: "ea",
    unitPrice: 72,
    section: "casework",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-maple-shaker",
    name: "Maple shaker door",
    supplier: "Cabinetdoors.com",
    unit: "sqft",
    unitPrice: 42,
    section: "doors",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
    notes: "5-piece frame, paint or stain grade",
  },
  {
    id: "m-mdf-slab",
    name: "MDF slab door (paint grade)",
    supplier: "Cabinetdoors.com",
    unit: "sqft",
    unitPrice: 28,
    section: "doors",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-walnut-slab",
    name: "Walnut slab veneered",
    supplier: "Independent Lumber",
    unit: "sqft",
    unitPrice: 68,
    section: "doors",
    defaultWastePct: 5,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-2k-clear",
    name: "2K poly — clear satin (3 coats)",
    supplier: "Akzo / in-house spray",
    unit: "sqft",
    unitPrice: 8.5,
    section: "finishing",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-2k-paint",
    name: "2K poly — solid colour (primer + 3 coats)",
    supplier: "Akzo / in-house spray",
    unit: "sqft",
    unitPrice: 11,
    section: "finishing",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
  },
  {
    id: "m-face-mdf",
    name: "Face MDF (toekicks, fillers, scribes)",
    supplier: "Windsor Plywood",
    unit: "sqft",
    unitPrice: 3.5,
    section: "face",
    defaultWastePct: 10,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
    notes: "CNC'd by Toolpath alongside casework",
  },
];

const SEED_FINISHES: Finish[] = [
  { id: "f1", name: "2K poly — clear satin", coats: 3, unitPrice: 8.5, priceUpdatedAt: NOW() },
  {
    id: "f2",
    name: "2K poly — solid colour",
    coats: 4,
    unitPrice: 11,
    priceUpdatedAt: NOW(),
    notes: "primer + 3 colour coats",
  },
  { id: "f3", name: "Conversion varnish — clear", coats: 2, unitPrice: 6, priceUpdatedAt: NOW() },
  {
    id: "f4",
    name: "Hardwax oil — Rubio",
    coats: 2,
    unitPrice: 9.5,
    priceUpdatedAt: NOW(),
    notes: "low-VOC, on-site touch up easy",
  },
];

const MATERIALS_TABLE = "catalog_materials";
const FINISHES_TABLE = "catalog_finishes";
const LS_KEY = "gw_catalog_v1";

// ─── Row mapping ────────────────────────────────────────────────────────────

type MaterialRow = {
  id: string;
  name: string;
  supplier: string;
  unit: Unit;
  unit_price: number;
  section: SectionId;
  default_waste_pct: number;
  default_markup_pct: number;
  price_updated_at: string;
  notes: string | null;
};

type FinishRow = {
  id: string;
  name: string;
  coats: number;
  unit_price: number;
  price_updated_at: string;
  notes: string | null;
};

function rowToMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    name: r.name,
    supplier: r.supplier,
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    section: r.section,
    defaultWastePct: Number(r.default_waste_pct),
    defaultMarkupPct: Number(r.default_markup_pct),
    priceUpdatedAt: r.price_updated_at,
    notes: r.notes ?? undefined,
  };
}

function materialToRow(m: Material): MaterialRow {
  return {
    id: m.id,
    name: m.name,
    supplier: m.supplier,
    unit: m.unit,
    unit_price: m.unitPrice,
    section: m.section,
    default_waste_pct: m.defaultWastePct ?? 0,
    default_markup_pct: m.defaultMarkupPct ?? 35,
    price_updated_at: m.priceUpdatedAt,
    notes: m.notes ?? null,
  };
}

function rowToFinish(r: FinishRow): Finish {
  return {
    id: r.id,
    name: r.name,
    coats: r.coats,
    unitPrice: Number(r.unit_price),
    priceUpdatedAt: r.price_updated_at,
    notes: r.notes ?? undefined,
  };
}

function finishToRow(f: Finish): FinishRow {
  return {
    id: f.id,
    name: f.name,
    coats: f.coats,
    unit_price: f.unitPrice,
    price_updated_at: f.priceUpdatedAt,
    notes: f.notes ?? null,
  };
}

// ─── localStorage fallback ──────────────────────────────────────────────────

type Persisted = { schema: number; materials: Material[]; finishes: Finish[] };

function localLoad(): { materials: Material[]; finishes: Finish[] } {
  if (typeof window === "undefined") {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      materials: (parsed.materials as Material[]) ?? SEED_MATERIALS,
      finishes: (parsed.finishes as Finish[]) ?? SEED_FINISHES,
    };
  } catch {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
}

function localSave(materials: Material[], finishes: Finish[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: 2, materials, finishes };
    window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* silent */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function logPriceChange(m: Material) {
  import("./priceHistory")
    .then((mod) =>
      mod.logPrice({
        materialId: m.id,
        supplier: m.supplier,
        unitPrice: m.unitPrice,
        source: "manual",
      })
    )
    .catch(() => {});
}

// ─── Context ────────────────────────────────────────────────────────────────

type CatalogContextValue = {
  materials: Material[];
  finishes: Finish[];
  loading: boolean;
  error: string | null;
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
  const [materials, setMaterials] = useState<Material[]>(SEED_MATERIALS);
  const [finishes, setFinishes] = useState<Finish[]>(SEED_FINISHES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const matRef = useRef<Material[]>(SEED_MATERIALS);
  const finRef = useRef<Finish[]>(SEED_FINISHES);
  useEffect(() => {
    matRef.current = materials;
  }, [materials]);
  useEffect(() => {
    finRef.current = finishes;
  }, [finishes]);

  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Initial load (seeds an empty DB so the price book is never blank).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend !== "supabase") {
        const loaded = localLoad();
        if (!cancelled) {
          setMaterials(loaded.materials);
          setFinishes(loaded.finishes);
          setLoading(false);
        }
        return;
      }
      try {
        const sb = getSupabase();
        const [m, f] = await Promise.all([
          sb.from(MATERIALS_TABLE).select("*"),
          sb.from(FINISHES_TABLE).select("*"),
        ]);
        if (m.error) throw m.error;
        if (f.error) throw f.error;
        let mats = (m.data as MaterialRow[] | null)?.map(rowToMaterial) ?? [];
        let fins = (f.data as FinishRow[] | null)?.map(rowToFinish) ?? [];
        if (mats.length === 0 && fins.length === 0) {
          await Promise.all([
            sb.from(MATERIALS_TABLE).insert(SEED_MATERIALS.map(materialToRow)),
            sb.from(FINISHES_TABLE).insert(SEED_FINISHES.map(finishToRow)),
          ]);
          mats = SEED_MATERIALS;
          fins = SEED_FINISHES;
        }
        if (!cancelled) {
          setMaterials(mats.sort((a, b) => a.name.localeCompare(b.name)));
          setFinishes(fins);
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
    if (!loading && backend === "localStorage") localSave(materials, finishes);
  }, [materials, finishes, loading, backend]);

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

  const addMaterial = useCallback(
    (m: Omit<Material, "id" | "priceUpdatedAt">) => {
      const created: Material = { ...m, id: newId("m"), priceUpdatedAt: NOW() };
      setMaterials((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(MATERIALS_TABLE)
          .insert(materialToRow(created))
          .then(({ error }) => error && setError(formatError(error)));
      }
    },
    [backend]
  );

  const updateMaterial = useCallback(
    (id: string, patch: Partial<Material>) => {
      setMaterials((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const next = { ...m, ...patch };
          if (patch.unitPrice !== undefined && patch.unitPrice !== m.unitPrice) {
            next.priceUpdatedAt = NOW();
            logPriceChange(next);
          }
          return next;
        })
      );
      scheduleFlush(id, () => {
        const row = matRef.current.find((m) => m.id === id);
        if (!row) return;
        const sb = getSupabase();
        void sb
          .from(MATERIALS_TABLE)
          .update(materialToRow(row))
          .eq("id", id)
          .then(({ error }) => error && setError(formatError(error)));
      });
    },
    [scheduleFlush]
  );

  const removeMaterial = useCallback(
    (id: string) => {
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(MATERIALS_TABLE)
          .delete()
          .eq("id", id)
          .then(({ error }) => error && setError(formatError(error)));
      }
    },
    [backend]
  );

  const addFinish = useCallback(
    (f: Omit<Finish, "id" | "priceUpdatedAt">) => {
      const created: Finish = { ...f, id: newId("f"), priceUpdatedAt: NOW() };
      setFinishes((prev) => [...prev, created]);
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(FINISHES_TABLE)
          .insert(finishToRow(created))
          .then(({ error }) => error && setError(formatError(error)));
      }
    },
    [backend]
  );

  const updateFinish = useCallback(
    (id: string, patch: Partial<Finish>) => {
      setFinishes((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      scheduleFlush(id, () => {
        const row = finRef.current.find((f) => f.id === id);
        if (!row) return;
        const sb = getSupabase();
        void sb
          .from(FINISHES_TABLE)
          .update(finishToRow(row))
          .eq("id", id)
          .then(({ error }) => error && setError(formatError(error)));
      });
    },
    [scheduleFlush]
  );

  const removeFinish = useCallback(
    (id: string) => {
      setFinishes((prev) => prev.filter((f) => f.id !== id));
      if (backend === "supabase") {
        const sb = getSupabase();
        void sb
          .from(FINISHES_TABLE)
          .delete()
          .eq("id", id)
          .then(({ error }) => error && setError(formatError(error)));
      }
    },
    [backend]
  );

  const reset = useCallback(() => {
    setMaterials(SEED_MATERIALS);
    setFinishes(SEED_FINISHES);
    if (backend === "supabase") {
      const sb = getSupabase();
      void (async () => {
        await sb.from(MATERIALS_TABLE).delete().neq("id", "");
        await sb.from(FINISHES_TABLE).delete().neq("id", "");
        await sb.from(MATERIALS_TABLE).insert(SEED_MATERIALS.map(materialToRow));
        await sb.from(FINISHES_TABLE).insert(SEED_FINISHES.map(finishToRow));
      })();
    }
  }, [backend]);

  const value = useMemo<CatalogContextValue>(
    () => ({
      materials,
      finishes,
      loading,
      error,
      addMaterial,
      updateMaterial,
      removeMaterial,
      addFinish,
      updateFinish,
      removeFinish,
      reset,
    }),
    [
      materials,
      finishes,
      loading,
      error,
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
