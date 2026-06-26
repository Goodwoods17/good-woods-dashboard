"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JOB_ITEMS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { rowToJobItem, jobItemToInsertRow, type JobItemRow } from "./jobItemRowMap";
import { nextStatus } from "./statusCycle";
import type { JobItem } from "./types";

const STORAGE_KEY = "gw_job_items_v1";
type Backend = "supabase" | "localStorage";

export type UseJobProgress = {
  items: JobItem[];
  backend: Backend;
  loading: boolean;
  /** Advance one item to the next status (optimistic; rolls back + throws on error). */
  cycleItem: (id: string) => Promise<void>;
  /** Add an ad-hoc tracer item to this job (optimistic; rolls back + throws on error). */
  addItem: (label: string, phase: JobItem["phase"]) => Promise<void>;
  /** Re-fetch all items from the DB — call after materialiseTemplates so newly
   *  inserted template items appear even if the Realtime push hasn't arrived. */
  refresh: () => Promise<void>;
};

function localLoad(): JobItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JobItem[]) : [];
  } catch {
    return [];
  }
}
function localSave(items: JobItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Live per-job progress. Mirrors features/drawings/lib/piecesStore.tsx — one
 * realtime channel + optimistic, idempotent merge — but scoped to a single
 * jobId and held as a hook (no provider needed for the tracer). React 18 defers
 * functional-update bodies, so a ref gives every mutator a deterministic,
 * race-safe view; patch-by-id is idempotent, so our own optimistic writes echo
 * back harmlessly and other clients' changes merge in (last-write-wins).
 */
export function useJobProgress(jobId: string): UseJobProgress {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const itemsRef = useRef<JobItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Unique per hook instance. Two useJobProgress() on the SAME jobId (e.g. the
  // board's note picker + the embedded field view) must NOT share a Realtime
  // channel name: supabase-js returns the *existing* channel for a duplicate
  // name, so the second hook's `.on()` runs on an already-subscribed channel and
  // throws ("cannot add postgres_changes callbacks ... after subscribe()") — a
  // client-side exception that blanks the whole page. A per-instance suffix keeps
  // each subscriber independent (the channel still filters on job_id).
  const channelKeyRef = useRef<string | null>(null);
  if (channelKeyRef.current === null) {
    channelKeyRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r${Math.random().toString(36).slice(2)}`;
  }

  // Initial load, scoped to this job.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (backend === "localStorage") {
        if (!cancelled) {
          setItems(localLoad().filter((i) => i.jobId === jobId));
          setLoading(false);
        }
        return;
      }
      const { data, error } = await getSupabase()
        .from(JOB_ITEMS_TABLE)
        .select("*")
        .eq("job_id", jobId);
      if (!cancelled) {
        if (!error && data) setItems((data as JobItemRow[]).map(rowToJobItem));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, jobId]);

  // Persist the local fallback so a reload survives without Supabase.
  useEffect(() => {
    if (!loading && backend === "localStorage") {
      const others = localLoad().filter((i) => i.jobId !== jobId);
      localSave([...others, ...items]);
    }
  }, [items, loading, backend, jobId]);

  // Live sync: subscribe only to this job's rows.
  useEffect(() => {
    if (backend !== "supabase") return;
    const sb = getSupabase();
    const channel = sb
      .channel(`job_items_changes_${jobId}_${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: JOB_ITEMS_TABLE,
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          setItems((cur) => {
            let next = cur;
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string })?.id;
              next = id ? cur.filter((x) => x.id !== id) : cur;
            } else {
              const item = rowToJobItem(payload.new as JobItemRow);
              next = cur.some((x) => x.id === item.id)
                ? cur.map((x) => (x.id === item.id ? item : x))
                : [...cur, item];
            }
            itemsRef.current = next;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [backend, jobId]);

  const cycleItem = useCallback(
    async (id: string) => {
      const prev = itemsRef.current.find((x) => x.id === id);
      if (!prev) return;
      const status = nextStatus(prev.status);
      const merged: JobItem = {
        ...prev,
        status,
        statusUpdatedAt: new Date().toISOString(),
      };
      itemsRef.current = itemsRef.current.map((x) => (x.id === id ? merged : x));
      setItems(itemsRef.current);
      if (backend === "supabase") {
        const { error } = await getSupabase()
          .from(JOB_ITEMS_TABLE)
          .update({ status: merged.status, status_updated_at: merged.statusUpdatedAt })
          .eq("id", id);
        if (error) {
          itemsRef.current = itemsRef.current.map((x) => (x.id === id ? prev : x));
          setItems(itemsRef.current);
          throw error;
        }
      }
    },
    [backend]
  );

  const addItem = useCallback(
    async (label: string, phase: JobItem["phase"]) => {
      const optimistic: JobItem = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `tmp-${Date.now()}`,
        jobId,
        phase,
        label,
        source: "adhoc",
        templateId: null,
        status: "not_started",
        visibility: "owner",
        sortOrder: itemsRef.current.length,
        statusUpdatedAt: null,
        statusUpdatedBy: null,
        createdAt: new Date().toISOString(),
      };
      itemsRef.current = [...itemsRef.current, optimistic];
      setItems(itemsRef.current);
      if (backend === "supabase") {
        const { data, error } = await getSupabase()
          .from(JOB_ITEMS_TABLE)
          .insert(jobItemToInsertRow(optimistic))
          .select()
          .single();
        if (error || !data) {
          itemsRef.current = itemsRef.current.filter((x) => x.id !== optimistic.id);
          setItems(itemsRef.current);
          throw error ?? new Error("Insert returned no row");
        }
        // Swap the optimistic row for the DB row (real id, defaults applied).
        const saved = rowToJobItem(data as JobItemRow);
        itemsRef.current = itemsRef.current.map((x) => (x.id === optimistic.id ? saved : x));
        setItems(itemsRef.current);
      }
    },
    [backend, jobId]
  );

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    const { data } = await getSupabase().from(JOB_ITEMS_TABLE).select("*").eq("job_id", jobId);
    if (data) {
      const loaded = (data as JobItemRow[]).map(rowToJobItem);
      // Merge-ADD, never wholesale-replace: refresh exists only to surface
      // newly-inserted rows (e.g. template items) that Realtime may not have
      // pushed yet. Replacing would clobber an in-flight optimistic tap whose
      // DB write hasn't committed before this SELECT — the user's tap would be
      // silently lost. Existing rows keep their (possibly optimistic) local
      // state; cross-client status changes still arrive via the Realtime channel.
      const byId = new Map(itemsRef.current.map((x) => [x.id, x]));
      let changed = false;
      for (const row of loaded) {
        if (!byId.has(row.id)) {
          byId.set(row.id, row);
          changed = true;
        }
      }
      if (changed) {
        const next = Array.from(byId.values());
        itemsRef.current = next;
        setItems(next);
      }
    }
  }, [backend, jobId]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
      ),
    [items]
  );

  return { items: sorted, backend, loading, cycleItem, addItem, refresh };
}
