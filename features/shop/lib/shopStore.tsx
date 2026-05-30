"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";

export type WorkStation = "cut" | "assemble" | "finish" | "install";

export const WORK_STATIONS: { key: WorkStation; label: string; wipLimit: number }[] = [
  { key: "cut", label: "Cut", wipLimit: 3 },
  { key: "assemble", label: "Assemble", wipLimit: 4 },
  { key: "finish", label: "Finish", wipLimit: 6 },
  { key: "install", label: "Install", wipLimit: 2 },
];

export const STATION_LABELS: Record<WorkStation, string> = {
  cut: "Cut",
  assemble: "Assemble",
  finish: "Finish",
  install: "Install",
};

/**
 * A work unit is a *piece* of a job (uppers, a run of doors, an install
 * phase). One job spawns several, and they can sit at different stations
 * at once, so a unit is its own row linked to a job by id, not a view of
 * the job's single pipeline stage.
 */
export type WorkUnit = {
  id: string;
  jobId: string | null;
  description: string;
  station: WorkStation;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
};

export type AndonEvent = {
  id: string;
  station: WorkStation | "all";
  message: string;
  raisedAt: string;
  resolvedAt: string | null;
};

export type NewWorkUnit = {
  jobId: string | null;
  description: string;
  station: WorkStation;
  startedAt?: string;
  notes?: string | null;
};

const SHOP_UNITS_TABLE = "shop_units";
const ANDON_TABLE = "andon_events";
const LS_KEY = "gw_shop_v2";

// ─── Row mapping (snake_case DB ↔ camelCase TS) ─────────────────────────────

type UnitRow = {
  id: string;
  job_id: string | null;
  description: string;
  station: WorkStation;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};

type AndonRow = {
  id: string;
  station: WorkStation | "all";
  message: string;
  raised_at: string;
  resolved_at: string | null;
};

function rowToUnit(r: UnitRow): WorkUnit {
  return {
    id: r.id,
    jobId: r.job_id,
    description: r.description,
    station: r.station,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    notes: r.notes,
  };
}

function rowToAndon(r: AndonRow): AndonEvent {
  return {
    id: r.id,
    station: r.station,
    message: r.message,
    raisedAt: r.raised_at,
    resolvedAt: r.resolved_at,
  };
}

// ─── localStorage fallback (dev / no-env) ───────────────────────────────────

type Persisted = { schema: number; units: WorkUnit[]; andon: AndonEvent[] };

function localLoad(): { units: WorkUnit[]; andon: AndonEvent[] } {
  if (typeof window === "undefined") return { units: [], andon: [] };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { units: [], andon: [] };
    const parsed: Persisted = JSON.parse(raw);
    return { units: parsed.units ?? [], andon: parsed.andon ?? [] };
  } catch {
    return { units: [], andon: [] };
  }
}

function localSave(units: WorkUnit[], andon: AndonEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ schema: 2, units, andon }));
  } catch {
    /* silent */
  }
}

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Context ────────────────────────────────────────────────────────────────

type ShopContextValue = {
  units: WorkUnit[];
  andon: AndonEvent[];
  loading: boolean;
  error: string | null;
  backend: "supabase" | "localStorage";
  addUnit: (u: NewWorkUnit) => Promise<void>;
  updateUnit: (id: string, patch: Partial<NewWorkUnit>) => Promise<void>;
  moveUnit: (id: string, station: WorkStation) => Promise<void>;
  completeUnit: (id: string) => Promise<void>;
  reopenUnit: (id: string) => Promise<void>;
  removeUnit: (id: string) => Promise<void>;
  raiseAndon: (station: WorkStation | "all", message: string) => Promise<void>;
  resolveAndon: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const backend: "supabase" | "localStorage" = hasSupabase() ? "supabase" : "localStorage";
  const [units, setUnits] = useState<WorkUnit[]>([]);
  const [andon, setAndon] = useState<AndonEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") {
      const loaded = localLoad();
      setUnits(loaded.units);
      setAndon(loaded.andon);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();
      const [u, a] = await Promise.all([
        sb.from(SHOP_UNITS_TABLE).select("*").order("started_at", { ascending: true }),
        sb.from(ANDON_TABLE).select("*").order("raised_at", { ascending: false }),
      ]);
      if (u.error) throw u.error;
      if (a.error) throw a.error;
      setUnits((u.data as UnitRow[] | null)?.map(rowToUnit) ?? []);
      setAndon((a.data as AndonRow[] | null)?.map(rowToAndon) ?? []);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // localStorage mirror
  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(units, andon);
  }, [units, andon, loading, backend]);

  const addUnit = useCallback(
    async (u: NewWorkUnit) => {
      const startedAt = u.startedAt ?? new Date().toISOString();
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { data, error } = await sb
            .from(SHOP_UNITS_TABLE)
            .insert({
              job_id: u.jobId,
              description: u.description,
              station: u.station,
              started_at: startedAt,
              notes: u.notes ?? null,
            })
            .select("*")
            .single();
          if (error) throw error;
          setUnits((prev) => [...prev, rowToUnit(data as UnitRow)]);
          setError(null);
        } catch (e) {
          setError(formatError(e));
        }
      } else {
        setUnits((prev) => [
          ...prev,
          {
            id: localId("u"),
            jobId: u.jobId,
            description: u.description,
            station: u.station,
            startedAt,
            completedAt: null,
            notes: u.notes ?? null,
          },
        ]);
      }
    },
    [backend]
  );

  // Optimistic patch helper: applies locally, pushes to Supabase, rolls back on error.
  const patchUnit = useCallback(
    async (id: string, dbPatch: Partial<UnitRow>, localPatch: Partial<WorkUnit>) => {
      const prevUnits = units;
      setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...localPatch } : u)));
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { error } = await sb.from(SHOP_UNITS_TABLE).update(dbPatch).eq("id", id);
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setUnits(prevUnits);
        }
      }
    },
    [backend, units]
  );

  const updateUnit = useCallback(
    async (id: string, patch: Partial<NewWorkUnit>) => {
      const dbPatch: Partial<UnitRow> = {};
      const localPatch: Partial<WorkUnit> = {};
      if (patch.jobId !== undefined) {
        dbPatch.job_id = patch.jobId;
        localPatch.jobId = patch.jobId;
      }
      if (patch.description !== undefined) {
        dbPatch.description = patch.description;
        localPatch.description = patch.description;
      }
      if (patch.station !== undefined) {
        dbPatch.station = patch.station;
        localPatch.station = patch.station;
      }
      if (patch.startedAt !== undefined) {
        dbPatch.started_at = patch.startedAt;
        localPatch.startedAt = patch.startedAt;
      }
      if (patch.notes !== undefined) {
        dbPatch.notes = patch.notes ?? null;
        localPatch.notes = patch.notes ?? null;
      }
      await patchUnit(id, dbPatch, localPatch);
    },
    [patchUnit]
  );

  const moveUnit = useCallback(
    async (id: string, station: WorkStation) => patchUnit(id, { station }, { station }),
    [patchUnit]
  );

  const completeUnit = useCallback(
    async (id: string) => {
      const completedAt = new Date().toISOString();
      await patchUnit(id, { completed_at: completedAt }, { completedAt });
    },
    [patchUnit]
  );

  const reopenUnit = useCallback(
    async (id: string) => patchUnit(id, { completed_at: null }, { completedAt: null }),
    [patchUnit]
  );

  const removeUnit = useCallback(
    async (id: string) => {
      const prevUnits = units;
      setUnits((prev) => prev.filter((u) => u.id !== id));
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { error } = await sb.from(SHOP_UNITS_TABLE).delete().eq("id", id);
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setUnits(prevUnits);
        }
      }
    },
    [backend, units]
  );

  const raiseAndon = useCallback(
    async (station: WorkStation | "all", message: string) => {
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { data, error } = await sb
            .from(ANDON_TABLE)
            .insert({ station, message })
            .select("*")
            .single();
          if (error) throw error;
          setAndon((prev) => [rowToAndon(data as AndonRow), ...prev]);
          setError(null);
        } catch (e) {
          setError(formatError(e));
        }
      } else {
        setAndon((prev) => [
          {
            id: localId("a"),
            station,
            message,
            raisedAt: new Date().toISOString(),
            resolvedAt: null,
          },
          ...prev,
        ]);
      }
    },
    [backend]
  );

  const resolveAndon = useCallback(
    async (id: string) => {
      const resolvedAt = new Date().toISOString();
      const prevAndon = andon;
      setAndon((prev) => prev.map((a) => (a.id === id ? { ...a, resolvedAt } : a)));
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { error } = await sb
            .from(ANDON_TABLE)
            .update({ resolved_at: resolvedAt })
            .eq("id", id);
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setAndon(prevAndon);
        }
      }
    },
    [backend, andon]
  );

  return (
    <ShopContext.Provider
      value={{
        units,
        andon,
        loading,
        error,
        backend,
        addUnit,
        updateUnit,
        moveUnit,
        completeUnit,
        reopenUnit,
        removeUnit,
        raiseAndon,
        resolveAndon,
        refresh,
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

// ─── Derived helpers ────────────────────────────────────────────────────────

/** Hours a unit has sat at its current station, "stale" past a threshold. */
export function hoursOnStation(startedAt: string): number {
  return (Date.now() - new Date(startedAt).getTime()) / 3_600_000;
}

export function timeOnStation(startedAt: string): string {
  const h = hoursOnStation(startedAt);
  if (h < 1) return `${Math.max(1, Math.floor(h * 60))}m`;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

/** A unit is "stale" if it has lingered well past a normal shift. */
export function isStale(startedAt: string): boolean {
  return hoursOnStation(startedAt) >= 48;
}
