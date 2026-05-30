"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, getSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";

export type StockEntry = {
  id: string;
  /** Soft reference to a catalog material id; null when free-text. */
  materialId: string | null;
  materialName: string;
  qtyOnHand: number;
  reorderPoint: number;
  unit: string;
  /** Per-unit replacement cost, snapshotted from the catalog or typed. */
  unitValue: number;
  /** Set when marked reordered; cleared once restocked above the reorder point. */
  reorderedAt: string | null;
};

export type NewStockEntry = Omit<StockEntry, "id" | "reorderedAt">;

const TABLE = "inventory_items";
const LS_KEY = "gw_inventory_v2";

type Row = {
  id: string;
  material_id: string | null;
  material_name: string;
  on_hand: number;
  reorder_at: number;
  unit: string;
  unit_value: number;
  reordered_at: string | null;
};

function rowToEntry(r: Row): StockEntry {
  return {
    id: r.id,
    materialId: r.material_id,
    materialName: r.material_name,
    qtyOnHand: Number(r.on_hand),
    reorderPoint: Number(r.reorder_at),
    unit: r.unit,
    unitValue: Number(r.unit_value),
    reorderedAt: r.reordered_at,
  };
}

function entryToRow(e: Partial<NewStockEntry>): Partial<Row> {
  const row: Partial<Row> = {};
  if (e.materialId !== undefined) row.material_id = e.materialId;
  if (e.materialName !== undefined) row.material_name = e.materialName;
  if (e.qtyOnHand !== undefined) row.on_hand = e.qtyOnHand;
  if (e.reorderPoint !== undefined) row.reorder_at = e.reorderPoint;
  if (e.unit !== undefined) row.unit = e.unit;
  if (e.unitValue !== undefined) row.unit_value = e.unitValue;
  return row;
}

/** A line needs reordering when on-hand is at or below the reorder point. */
export function isLow(s: StockEntry): boolean {
  return s.qtyOnHand <= s.reorderPoint;
}

// ─── localStorage fallback ──────────────────────────────────────────────────

function localLoad(): StockEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StockEntry[]) : [];
  } catch {
    return [];
  }
}

function localSave(stock: StockEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(stock));
  } catch {
    /* silent */
  }
}

function localId(): string {
  return `inv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type InventoryStore = {
  stock: StockEntry[];
  loading: boolean;
  error: string | null;
  addItem: (e: NewStockEntry) => Promise<void>;
  updateItem: (id: string, patch: Partial<NewStockEntry>) => void;
  markReordered: (id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useInventory(): InventoryStore {
  const backend = hasSupabase() ? "supabase" : "localStorage";
  const [stock, setStock] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stockRef = useRef<StockEntry[]>([]);
  useEffect(() => {
    stockRef.current = stock;
  }, [stock]);

  // Debounced writes so inline number edits don't fire one request per keystroke.
  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async () => {
    if (backend !== "supabase") {
      setStock(localLoad());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("material_name", { ascending: true });
      if (error) throw error;
      setStock((data as Row[] | null)?.map(rowToEntry) ?? []);
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

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(stock);
  }, [stock, loading, backend]);

  const addItem = useCallback(
    async (e: NewStockEntry) => {
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { data, error } = await sb.from(TABLE).insert(entryToRow(e)).select("*").single();
          if (error) throw error;
          setStock((prev) =>
            [...prev, rowToEntry(data as Row)].sort((a, b) =>
              a.materialName.localeCompare(b.materialName)
            )
          );
          setError(null);
        } catch (err) {
          setError(formatError(err));
        }
      } else {
        setStock((prev) =>
          [...prev, { ...e, id: localId(), reorderedAt: null }].sort((a, b) =>
            a.materialName.localeCompare(b.materialName)
          )
        );
      }
    },
    [backend]
  );

  const flush = useCallback(
    (id: string) => {
      if (backend !== "supabase") return;
      const entry = stockRef.current.find((s) => s.id === id);
      if (!entry) return;
      const sb = getSupabase();
      void sb
        .from(TABLE)
        .update(entryToRow(entry))
        .eq("id", id)
        .then(({ error }) => {
          if (error) setError(formatError(error));
        });
    },
    [backend]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<NewStockEntry>) => {
      setStock((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const merged = { ...s, ...patch };
          // Restocking above the reorder point clears the "on order" flag.
          if (merged.qtyOnHand > merged.reorderPoint) merged.reorderedAt = null;
          return merged;
        })
      );
      const timers = pending.current;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => {
          flush(id);
          timers.delete(id);
        }, 600)
      );
    },
    [flush]
  );

  const markReordered = useCallback(
    async (id: string) => {
      const reorderedAt = new Date().toISOString();
      const prev = stockRef.current;
      setStock((p) => p.map((s) => (s.id === id ? { ...s, reorderedAt } : s)));
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { error } = await sb.from(TABLE).update({ reordered_at: reorderedAt }).eq("id", id);
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setStock(prev);
        }
      }
    },
    [backend]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const prev = stockRef.current;
      setStock((p) => p.filter((s) => s.id !== id));
      if (backend === "supabase") {
        try {
          const sb = getSupabase();
          const { error } = await sb.from(TABLE).delete().eq("id", id);
          if (error) throw error;
          setError(null);
        } catch (e) {
          setError(formatError(e));
          setStock(prev);
        }
      }
    },
    [backend]
  );

  return { stock, loading, error, addItem, updateItem, markReordered, removeItem, refresh };
}
