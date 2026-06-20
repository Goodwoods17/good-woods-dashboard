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
import type { Trade } from "./types";
import { rowToTrade, tradeToRow, TRADES_TABLE, type TradeRow } from "./rowMaps";

const STORAGE_KEY = "gw_trades_v1";
const SCHEMA_VERSION = 1;
const SEED_TS = "2026-01-01T00:00:00.000Z";

type Persisted = { schema: number; trades: Trade[] };

export type TradesBackend = "supabase" | "localStorage";

/**
 * The default discipline registry, mirroring the SQL seed in
 * 20260620000000_partners.sql. Used as the localStorage fallback so the
 * registry is never empty when Supabase isn't configured (dev/demo). In
 * Supabase mode the migration seed is the source of truth.
 */
export const SEED_TRADES: Trade[] = [
  ["installer", "Installer", "wrench", true, 0],
  ["finisher", "Finisher", "paint-roller", true, 1],
  ["countertop", "Countertop", "square", true, 2],
  ["electrical", "Electrical", "zap", false, 3],
  ["plumbing", "Plumbing", "droplet", false, 4],
  ["delivery", "Delivery", "truck", true, 5],
  ["upholstery", "Upholstery", "armchair", false, 6],
  ["other", "Other", "shapes", false, 7],
].map(([key, label, icon, suggested, order]) => ({
  id: `seed-${key as string}`,
  key: key as string,
  label: label as string,
  color: key as string, // --trade-<key>
  icon: icon as string,
  isSuggestedDefault: suggested as boolean,
  sortOrder: order as number,
  active: true,
  createdAt: SEED_TS,
  updatedAt: SEED_TS,
}));

type TradesContextValue = {
  trades: Trade[];
  loading: boolean;
  backend: TradesBackend;
  error: string | null;
  refresh: () => Promise<void>;
  createTrade: (trade: Trade) => Promise<void>;
  updateTrade: (id: string, patch: Partial<Trade>) => Promise<void>;
  archiveTrade: (id: string) => Promise<void>;
  unarchiveTrade: (id: string) => Promise<void>;
};

const TradesContext = createContext<TradesContextValue | null>(null);

function bySort(a: Trade, b: Trade): number {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
}

function localLoad(): Trade[] {
  if (typeof window === "undefined") return SEED_TRADES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_TRADES;
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.trades)) {
      return SEED_TRADES;
    }
    return parsed.trades.length ? parsed.trades : SEED_TRADES;
  } catch {
    return SEED_TRADES;
  }
}

function localSave(trades: Trade[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, trades };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent fail, matches contactsStore */
  }
}

async function supabaseLoad(): Promise<Trade[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TRADES_TABLE)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as TradeRow[] | null)?.map(rowToTrade) ?? [];
}

export function TradesProvider({ children }: { children: ReactNode }) {
  const backend: TradesBackend = hasSupabase() ? "supabase" : "localStorage";
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tradesRef = useRef<Trade[]>([]);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setTrades(remote);
        } else {
          if (!cancelled) setTrades(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setTrades(localLoad());
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
    if (!loading && backend === "localStorage") localSave(trades);
  }, [trades, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      setTrades(await supabaseLoad());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const createTrade = useCallback(
    async (trade: Trade) => {
      setTrades((prev) => [...prev, trade].sort(bySort));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(TRADES_TABLE).insert(tradeToRow(trade));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setTrades((prev) => prev.filter((t) => t.id !== trade.id));
        throw e;
      }
    },
    [backend]
  );

  const updateTrade = useCallback(
    async (id: string, patch: Partial<Trade>) => {
      const previous = tradesRef.current;
      setTrades((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort(bySort)
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const merged = { ...previous.find((t) => t.id === id), ...patch } as Trade;
        const { error: upErr } = await sb
          .from(TRADES_TABLE)
          .update(tradeToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setTrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      const previous = tradesRef.current;
      setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, active } : t)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(TRADES_TABLE)
          .update({ active })
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setTrades(previous);
        throw e;
      }
    },
    [backend]
  );

  const archiveTrade = useCallback((id: string) => setActive(id, false), [setActive]);
  const unarchiveTrade = useCallback((id: string) => setActive(id, true), [setActive]);

  return (
    <TradesContext.Provider
      value={{
        trades,
        loading,
        backend,
        error,
        refresh,
        createTrade,
        updateTrade,
        archiveTrade,
        unarchiveTrade,
      }}
    >
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades(): TradesContextValue {
  const ctx = useContext(TradesContext);
  if (!ctx) {
    throw new Error("useTrades must be used inside <TradesProvider>");
  }
  return ctx;
}

export function useTrade(id: string | null | undefined): Trade | undefined {
  const { trades } = useTrades();
  return id ? trades.find((t) => t.id === id) : undefined;
}
