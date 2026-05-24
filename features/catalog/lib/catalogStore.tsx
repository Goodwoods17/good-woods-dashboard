"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { Unit } from "@features/estimator/lib/types";
import type { SectionId } from "@features/estimator/lib/sections";

// Schema v2 (2026-05-23):
//   - `unit` replaces the implicit "everything is sqft" assumption
//   - `section` ties each material to an estimator section
//   - `defaultWastePct` / `defaultMarkupPct` seed new estimator lines
//   - `priceUpdatedAt` powers the stale-price chip
//   - `unitPrice` renames `pricePerSqft` so the field name matches reality
//
// Old v1 data (schema = 1) is migrated forward on first load: pricePerSqft
// → unitPrice, unit defaulted to "sqft", section defaulted to "casework".

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
  // ─── Casework (sheet goods, by the 4×8 sheet) ──────────────────────
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

  // ─── Doors (by sqft) ───────────────────────────────────────────────
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

  // ─── Finishing (in-house spray, by sqft) ──────────────────────────
  // Finish items also live here so they show up as estimator catalog
  // entries on the Finishing section. (Separate Finish table kept for
  // backwards compatibility with the old UI.)
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

  // ─── Face components (by sqft of face) ────────────────────────────
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
  // Legacy table — kept so MaterialsTable + FinishesTable both work
  // during transition. New picker work in Phase 5 reads from Material.
  {
    id: "f1",
    name: "2K poly — clear satin",
    coats: 3,
    unitPrice: 8.5,
    priceUpdatedAt: NOW(),
  },
  {
    id: "f2",
    name: "2K poly — solid colour",
    coats: 4,
    unitPrice: 11,
    priceUpdatedAt: NOW(),
    notes: "primer + 3 colour coats",
  },
  {
    id: "f3",
    name: "Conversion varnish — clear",
    coats: 2,
    unitPrice: 6,
    priceUpdatedAt: NOW(),
  },
  {
    id: "f4",
    name: "Hardwax oil — Rubio",
    coats: 2,
    unitPrice: 9.5,
    priceUpdatedAt: NOW(),
    notes: "low-VOC, on-site touch up easy",
  },
];

const KEY = "gw_catalog_v1"; // historic key (v1 + v2 share it — schema field distinguishes)

type CatalogContextValue = {
  materials: Material[];
  finishes: Finish[];
  addMaterial: (m: Omit<Material, "id" | "priceUpdatedAt">) => void;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  removeMaterial: (id: string) => void;
  addFinish: (f: Omit<Finish, "id" | "priceUpdatedAt">) => void;
  updateFinish: (id: string, patch: Partial<Finish>) => void;
  removeFinish: (id: string) => void;
  reset: () => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

type Persisted = {
  schema: number;
  materials: Material[];
  finishes: Finish[];
};

// ─── v1 → v2 migration ───────────────────────────────────────────────
// v1 Material had: { id, name, supplier, pricePerSqft, notes? }
// Lift pricePerSqft → unitPrice, default unit = "sqft", section = "casework",
// priceUpdatedAt = now. Existing seeds are blown away if they have IDs
// that don't match the new seed list (since the section/unit guesses
// would be wrong for hinges-priced-as-sqft etc).

type V1Material = {
  id: string;
  name: string;
  supplier: string;
  pricePerSqft: number;
  notes?: string;
};

type V1Finish = {
  id: string;
  name: string;
  coats: number;
  pricePerSqft: number;
  notes?: string;
};

function migrateMaterial(m: V1Material): Material {
  return {
    id: m.id,
    name: m.name,
    supplier: m.supplier,
    unit: "sqft",
    unitPrice: m.pricePerSqft,
    section: "casework",
    defaultWastePct: 0,
    defaultMarkupPct: 35,
    priceUpdatedAt: NOW(),
    notes: m.notes,
  };
}

function migrateFinish(f: V1Finish): Finish {
  return {
    id: f.id,
    name: f.name,
    coats: f.coats,
    unitPrice: f.pricePerSqft,
    priceUpdatedAt: NOW(),
    notes: f.notes,
  };
}

function load(): { materials: Material[]; finishes: Finish[] } {
  if (typeof window === "undefined") {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
    const parsed = JSON.parse(raw) as Partial<Persisted> & { schema?: number };
    if (parsed.schema === 2) {
      return {
        materials: (parsed.materials as Material[]) ?? SEED_MATERIALS,
        finishes: (parsed.finishes as Finish[]) ?? SEED_FINISHES,
      };
    }
    if (parsed.schema === 1) {
      const oldMats = (parsed.materials as unknown as V1Material[]) ?? [];
      const oldFins = (parsed.finishes as unknown as V1Finish[]) ?? [];
      return {
        materials:
          oldMats.length > 0
            ? oldMats.map(migrateMaterial)
            : SEED_MATERIALS,
        finishes:
          oldFins.length > 0 ? oldFins.map(migrateFinish) : SEED_FINISHES,
      };
    }
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  } catch {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
}

function save(materials: Material[], finishes: Finish[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: 2, materials, finishes };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* silent */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<Material[]>(SEED_MATERIALS);
  const [finishes, setFinishes] = useState<Finish[]>(SEED_FINISHES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = load();
    setMaterials(loaded.materials);
    setFinishes(loaded.finishes);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(materials, finishes);
  }, [materials, finishes, hydrated]);

  const addMaterial = useCallback((m: Omit<Material, "id" | "priceUpdatedAt">) => {
    setMaterials((prev) => [
      ...prev,
      { ...m, id: newId("m"), priceUpdatedAt: NOW() },
    ]);
  }, []);

  const updateMaterial = useCallback(
    (id: string, patch: Partial<Material>) => {
      setMaterials((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          // If the price changed, bump priceUpdatedAt + log to history.
          const next = { ...m, ...patch };
          if (patch.unitPrice !== undefined && patch.unitPrice !== m.unitPrice) {
            next.priceUpdatedAt = NOW();
            // priceHistory.ts hook in here (Phase 4.2)
            try {
              // Async-imported to keep this store synchronous-safe.
              import("./priceHistory")
                .then((mod) =>
                  mod.logPrice({
                    materialId: m.id,
                    supplier: next.supplier,
                    unitPrice: next.unitPrice,
                    source: "manual",
                  }),
                )
                .catch(() => {});
            } catch {
              /* silent — price history is non-critical */
            }
          }
          return next;
        }),
      );
    },
    [],
  );

  const removeMaterial = useCallback((id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addFinish = useCallback((f: Omit<Finish, "id" | "priceUpdatedAt">) => {
    setFinishes((prev) => [
      ...prev,
      { ...f, id: newId("f"), priceUpdatedAt: NOW() },
    ]);
  }, []);
  const updateFinish = useCallback((id: string, patch: Partial<Finish>) => {
    setFinishes((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);
  const removeFinish = useCallback((id: string) => {
    setFinishes((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const reset = useCallback(() => {
    setMaterials(SEED_MATERIALS);
    setFinishes(SEED_FINISHES);
  }, []);

  const value = useMemo<CatalogContextValue>(
    () => ({
      materials,
      finishes,
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
      addMaterial,
      updateMaterial,
      removeMaterial,
      addFinish,
      updateFinish,
      removeFinish,
      reset,
    ],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}

// Convenience hook: materials grouped by section for the new picker UI.
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
