"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { Subtrade } from "./types";
import {
  rowToSubtrade,
  subtradeToRow,
  SUBTRADES_TABLE,
  type SubtradeRow,
} from "./rowMaps";

const STORAGE_KEY = "gw_subtrades_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; subtrades: Subtrade[] };

export type SubtradesBackend = "supabase" | "localStorage";

type SubtradesContextValue = {
  subtrades: Subtrade[];
  loading: boolean;
  backend: SubtradesBackend;
  error: string | null;
  refresh: () => Promise<void>;
  createSubtrade: (subtrade: Subtrade) => Promise<void>;
  updateSubtrade: (id: string, patch: Partial<Subtrade>) => Promise<void>;
  archiveSubtrade: (id: string) => Promise<void>;
  unarchiveSubtrade: (id: string) => Promise<void>;
};

const SubtradesContext = createContext<SubtradesContextValue | null>(null);

function byName(a: Subtrade, b: Subtrade): number {
  return a.name.localeCompare(b.name);
}

function localLoad(): Subtrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.subtrades)) {
      return [];
    }
    return parsed.subtrades;
  } catch {
    return [];
  }
}

function localSave(subtrades: Subtrade[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, subtrades };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent fail, matches contactsStore */
  }
}

async function supabaseLoad(): Promise<Subtrade[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(SUBTRADES_TABLE)
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as SubtradeRow[] | null)?.map(rowToSubtrade) ?? [];
}

export function SubtradesProvider({ children }: { children: ReactNode }) {
  const backend: SubtradesBackend = hasSupabase() ? "supabase" : "localStorage";
  const [subtrades, setSubtrades] = useState<Subtrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subtradesRef = useRef<Subtrade[]>([]);

  useEffect(() => {
    subtradesRef.current = subtrades;
  }, [subtrades]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setSubtrades(remote);
        } else {
          if (!cancelled) setSubtrades(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setSubtrades(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(subtrades);
  }, [subtrades, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      setSubtrades(await supabaseLoad());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const createSubtrade = useCallback(
    async (subtrade: Subtrade) => {
      setSubtrades((prev) => [...prev, subtrade].sort(byName));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(SUBTRADES_TABLE)
          .insert(subtradeToRow(subtrade));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setSubtrades((prev) => prev.filter((s) => s.id !== subtrade.id));
        throw e;
      }
    },
    [backend]
  );

  const updateSubtrade = useCallback(
    async (id: string, patch: Partial<Subtrade>) => {
      const previous = subtradesRef.current;
      setSubtrades((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)).sort(byName)
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const merged = { ...previous.find((s) => s.id === id), ...patch } as Subtrade;
        const { error: upErr } = await sb
          .from(SUBTRADES_TABLE)
          .update(subtradeToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setSubtrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      const previous = subtradesRef.current;
      setSubtrades((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(SUBTRADES_TABLE)
          .update({ active })
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setSubtrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const archiveSubtrade = useCallback((id: string) => setActive(id, false), [setActive]);
  const unarchiveSubtrade = useCallback((id: string) => setActive(id, true), [setActive]);

  return (
    <SubtradesContext.Provider
      value={{
        subtrades,
        loading,
        backend,
        error,
        refresh,
        createSubtrade,
        updateSubtrade,
        archiveSubtrade,
        unarchiveSubtrade,
      }}
    >
      {children}
    </SubtradesContext.Provider>
  );
}

export function useSubtrades(): SubtradesContextValue {
  const ctx = useContext(SubtradesContext);
  if (!ctx) {
    throw new Error("useSubtrades must be used inside <SubtradesProvider>");
  }
  return ctx;
}

export function useSubtrade(id: string | null | undefined): Subtrade | undefined {
  const { subtrades } = useSubtrades();
  return id ? subtrades.find((s) => s.id === id) : undefined;
}
