"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase } from "@shared/lib/supabase";

// ─── Pure merge core (exported for unit tests) ────────────────────────────────

export type RealtimeMergeEvent<Model> =
  | { type: "DELETE"; id: string | undefined }
  | { type: "UPSERT"; model: Model };

export type MergeOpts<Model> = {
  getId: (m: Model) => string;
  /** Client-side predicate; a model that fails it is dropped from the merge. */
  accept?: (m: Model) => boolean;
  /** Where a brand-new id lands. Default "append". */
  order?: "append" | "prepend";
};

/**
 * Idempotent patch-by-id. DELETE removes by id; UPSERT replaces an existing id
 * in place or inserts a new one at the chosen end. Idempotent because a client's
 * own optimistic write echoes back as an UPSERT of an id it already holds, which
 * replaces-in-place (a no-op in content) rather than duplicating.
 */
export function mergeRow<Model>(
  cur: Model[],
  evt: RealtimeMergeEvent<Model>,
  opts: MergeOpts<Model>
): Model[] {
  const { getId, accept, order = "append" } = opts;
  if (evt.type === "DELETE") {
    return evt.id ? cur.filter((x) => getId(x) !== evt.id) : cur;
  }
  const m = evt.model;
  if (accept && !accept(m)) return cur;
  const id = getId(m);
  if (cur.some((x) => getId(x) === id)) {
    return cur.map((x) => (getId(x) === id ? m : x));
  }
  return order === "prepend" ? [m, ...cur] : [...cur, m];
}

// ─── useLiveRows hook ─────────────────────────────────────────────────────────

export type LiveRowsConfig<Row, Model> = {
  table: string;
  /** Initial fetch. Branch on backend inside here; it owns the localStorage path. */
  load: () => Promise<Model[]>;
  rowToModel: (row: Row) => Model;
  getId: (m: Model) => string;
  /** Server-side realtime filter, e.g. `job_id=eq.${jobId}`. Omit to watch all rows. */
  filter?: string;
  /** Which postgres event to subscribe to. Default "*". */
  event?: "*" | "INSERT";
  /** Client-side predicate applied to every realtime upsert. */
  accept?: (m: Model) => boolean;
  /** Where a new id lands on upsert. Default "append". */
  order?: "append" | "prepend";
  /** Realtime + load only run when true (e.g. hasSupabase()). */
  live: boolean;
  /** Re-run load + re-subscribe whenever this changes (e.g. jobId, sorted jobIds). */
  resubscribeKey?: string;
};

export type LiveRows<Model> = {
  rows: Model[];
  loading: boolean;
  /** Functional updater that also keeps the synchronous ref in sync (for optimistic writes). */
  setRows: (updater: (cur: Model[]) => Model[]) => void;
  /** Synchronous mirror of rows — read this inside mutators, never post-setState state. */
  rowsRef: MutableRefObject<Model[]>;
};

/**
 * Fetch + live-sync one table into a single state array. Owns the per-instance
 * channel key, the postgres_changes subscription, the idempotent merge, and
 * cleanup — the boilerplate every store used to reimplement. Callers supply the
 * row→model map and id-getter (the only things that vary) and get back the rows
 * plus a ref + setter for optimistic writes.
 */
export function useLiveRows<Row, Model>(cfg: LiveRowsConfig<Row, Model>): LiveRows<Model> {
  const [rows, setRowsState] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const rowsRef = useRef<Model[]>([]);

  const setRows = useCallback((updater: (cur: Model[]) => Model[]) => {
    const next = updater(rowsRef.current);
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  // Latest config in a ref so the subscription effect can depend only on the
  // subscription's identity (table/filter/key) without stale closures over the
  // row→model map, accept predicate, or load fn.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // Per-instance channel suffix — supabase-js returns the existing channel for a
  // duplicate name, so a second subscriber would `.on()` after `subscribe()` and
  // throw, blanking the page. A unique suffix keeps each subscriber independent.
  const channelKeyRef = useRef<string | null>(null);
  if (channelKeyRef.current === null) {
    channelKeyRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r${Math.random().toString(36).slice(2)}`;
  }

  const { table, filter, event = "*", live, resubscribeKey } = cfg;

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loaded = await cfgRef.current.load();
      if (!cancelled) {
        rowsRef.current = loaded;
        setRowsState(loaded);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, resubscribeKey]);

  // Realtime subscription.
  useEffect(() => {
    if (!live) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`live_${table}_${resubscribeKey ?? "all"}_${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const { rowToModel, getId, accept, order } = cfgRef.current;
          const evt: RealtimeMergeEvent<Model> =
            payload.eventType === "DELETE"
              ? { type: "DELETE", id: (payload.old as { id?: string })?.id }
              : { type: "UPSERT", model: rowToModel(payload.new as Row) };
          setRows((cur) => mergeRow(cur, evt, { getId, accept, order }));
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, table, filter, event, resubscribeKey]);

  return { rows, loading, setRows, rowsRef };
}
