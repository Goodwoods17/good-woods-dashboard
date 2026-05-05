"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Material = {
  id: string;
  name: string;
  supplier: string;
  pricePerSqft: number;
  notes?: string;
};

export type Finish = {
  id: string;
  name: string;
  coats: number;
  pricePerSqft: number;
  notes?: string;
};

const SEED_MATERIALS: Material[] = [
  { id: "m1", name: "White oak — rift sawn", supplier: "Independent Lumber", pricePerSqft: 18.5 },
  { id: "m2", name: "Walnut — flat sawn", supplier: "Independent Lumber", pricePerSqft: 22.0 },
  { id: "m3", name: "Baltic birch ply 18mm", supplier: "Windsor Plywood", pricePerSqft: 6.4 },
  { id: "m4", name: "MDF 18mm (paint grade)", supplier: "Windsor Plywood", pricePerSqft: 3.2 },
  { id: "m5", name: "Slab door blank — paint grade", supplier: "Cabinetdoors.com", pricePerSqft: 9.6 },
  { id: "m6", name: "Edgebanding 1mm — to match", supplier: "Frameware Hardware", pricePerSqft: 0.9 },
  { id: "m7", name: "Blum Blumotion hinge (pair)", supplier: "Frameware Hardware", pricePerSqft: 14, notes: "per pair, sold by the door" },
  { id: "m8", name: "Solid surface — Caesarstone", supplier: "Stone Tile West", pricePerSqft: 95 },
];

const SEED_FINISHES: Finish[] = [
  { id: "f1", name: "2K poly — clear satin", coats: 3, pricePerSqft: 8.5 },
  { id: "f2", name: "2K poly — solid colour", coats: 4, pricePerSqft: 11.0, notes: "primer + 3 colour coats" },
  { id: "f3", name: "Conversion varnish — clear", coats: 2, pricePerSqft: 6.0 },
  { id: "f4", name: "Hardwax oil — Rubio", coats: 2, pricePerSqft: 9.5, notes: "low-VOC, on-site touch up easy" },
];

const KEY = "gw_catalog_v1";

type CatalogContextValue = {
  materials: Material[];
  finishes: Finish[];
  addMaterial: (m: Omit<Material, "id">) => void;
  updateMaterial: (id: string, patch: Partial<Material>) => void;
  removeMaterial: (id: string) => void;
  addFinish: (f: Omit<Finish, "id">) => void;
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

function load(): { materials: Material[]; finishes: Finish[] } {
  if (typeof window === "undefined") {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== 1) return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
    return {
      materials: parsed.materials ?? SEED_MATERIALS,
      finishes: parsed.finishes ?? SEED_FINISHES,
    };
  } catch {
    return { materials: SEED_MATERIALS, finishes: SEED_FINISHES };
  }
}

function save(materials: Material[], finishes: Finish[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: 1, materials, finishes };
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

  const addMaterial = useCallback((m: Omit<Material, "id">) => {
    setMaterials((prev) => [...prev, { ...m, id: newId("m") }]);
  }, []);
  const updateMaterial = useCallback((id: string, patch: Partial<Material>) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);
  const removeMaterial = useCallback((id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addFinish = useCallback((f: Omit<Finish, "id">) => {
    setFinishes((prev) => [...prev, { ...f, id: newId("f") }]);
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

  return (
    <CatalogContext.Provider
      value={{
        materials,
        finishes,
        addMaterial,
        updateMaterial,
        removeMaterial,
        addFinish,
        updateFinish,
        removeFinish,
        reset,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}
