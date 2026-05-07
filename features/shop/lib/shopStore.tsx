"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type WorkStation = "cut" | "assemble" | "finish" | "install";

export const WORK_STATIONS: { key: WorkStation; label: string; wipLimit: number }[] = [
  { key: "cut", label: "Cut", wipLimit: 3 },
  { key: "assemble", label: "Assemble", wipLimit: 4 },
  { key: "finish", label: "Finish", wipLimit: 6 },
  { key: "install", label: "Install", wipLimit: 2 },
];

export type WorkUnit = {
  id: string;
  jobCode: string;
  description: string;
  station: WorkStation;
  startedAt: string;
  notes?: string;
};

export type AndonEvent = {
  id: string;
  station: WorkStation | "all";
  message: string;
  raisedAt: string;
  resolvedAt?: string;
};

const KEY = "gw_shop_v1";

const SEED_UNITS: WorkUnit[] = [
  {
    id: "u1",
    jobCode: "GW-2026-001",
    description: "Suite 301 — upper boxes",
    station: "cut",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: "u2",
    jobCode: "GW-2026-001",
    description: "Suite 302 — upper boxes",
    station: "cut",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "u3",
    jobCode: "GW-2026-002",
    description: "Pantry millwork — sides + shelves",
    station: "assemble",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
  },
  {
    id: "u4",
    jobCode: "GW-2026-003",
    description: "28 refacing doors — first coat",
    station: "finish",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: "u5",
    jobCode: "GW-2026-003",
    description: "4 drawer fronts — first coat",
    station: "finish",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
  },
  {
    id: "u6",
    jobCode: "GW-2026-004",
    description: "Toolpath — desk + credenza on site",
    station: "install",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
];

type ShopContextValue = {
  units: WorkUnit[];
  andon: AndonEvent[];
  addUnit: (u: Omit<WorkUnit, "id" | "startedAt">) => void;
  moveUnit: (id: string, station: WorkStation) => void;
  removeUnit: (id: string) => void;
  raiseAndon: (station: WorkStation | "all", message: string) => void;
  resolveAndon: (id: string) => void;
};

const ShopContext = createContext<ShopContextValue | null>(null);

type Persisted = { schema: number; units: WorkUnit[]; andon: AndonEvent[] };

function load(): { units: WorkUnit[]; andon: AndonEvent[] } {
  if (typeof window === "undefined") return { units: SEED_UNITS, andon: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { units: SEED_UNITS, andon: [] };
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== 1) return { units: SEED_UNITS, andon: [] };
    return { units: parsed.units ?? SEED_UNITS, andon: parsed.andon ?? [] };
  } catch {
    return { units: SEED_UNITS, andon: [] };
  }
}

function save(units: WorkUnit[], andon: AndonEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ schema: 1, units, andon }));
  } catch {
    /* silent */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<WorkUnit[]>(SEED_UNITS);
  const [andon, setAndon] = useState<AndonEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = load();
    setUnits(loaded.units);
    setAndon(loaded.andon);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(units, andon);
  }, [units, andon, hydrated]);

  const addUnit = useCallback((u: Omit<WorkUnit, "id" | "startedAt">) => {
    setUnits((prev) => [
      ...prev,
      { ...u, id: newId("u"), startedAt: new Date().toISOString() },
    ]);
  }, []);

  const moveUnit = useCallback((id: string, station: WorkStation) => {
    setUnits((prev) =>
      prev.map((u) => (u.id === id ? { ...u, station } : u))
    );
  }, []);

  const removeUnit = useCallback((id: string) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const raiseAndon = useCallback(
    (station: WorkStation | "all", message: string) => {
      setAndon((prev) => [
        {
          id: newId("a"),
          station,
          message,
          raisedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    []
  );

  const resolveAndon = useCallback((id: string) => {
    setAndon((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, resolvedAt: new Date().toISOString() } : a
      )
    );
  }, []);

  return (
    <ShopContext.Provider
      value={{
        units,
        andon,
        addUnit,
        moveUnit,
        removeUnit,
        raiseAndon,
        resolveAndon,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}
