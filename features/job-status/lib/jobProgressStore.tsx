"use client";

import { useCallback, useEffect, useMemo } from "react";
import { JOB_ITEMS_TABLE, JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { useLiveRows } from "@shared/lib/useLiveRows";
import type { JobPiece } from "@shared/lib/types";
import { rowToJobItem, jobItemToInsertRow, type JobItemRow } from "./jobItemRowMap";
import { rowToPiece, pieceToRow, type PieceRow } from "@features/drawings/lib/piecesRowMap";
import { nextStatus as drawingNextStatus } from "@features/drawings/lib/pipelines";
import { nextStatus } from "./statusCycle";
import { recordStatusChange } from "./eventStore";
import { optimistic } from "@shared/lib/optimistic";
import type { JobItem, Visibility } from "./types";

const STORAGE_KEY = "gw_job_items_v1";
const PIECES_STORAGE_KEY = "gw_job_pieces_v1";
type Backend = "supabase" | "localStorage";

export type UseJobProgress = {
  items: JobItem[];
  /** Drawings pieces for this job's delivery/install phases (slice 4). */
  pieces: JobPiece[];
  backend: Backend;
  loading: boolean;
  /** Advance one job_item to the next status (optimistic; rolls back + throws on error). */
  cycleItem: (id: string) => Promise<void>;
  /** Advance one Drawings piece to its next status in its kind's pipeline
   *  (optimistic; rolls back + throws on error). Slice 4. */
  cyclePiece: (id: string) => Promise<void>;
  /** Add an ad-hoc tracer item to this job (optimistic; rolls back + throws on error). */
  addItem: (label: string, phase: JobItem["phase"]) => Promise<void>;
  /** Re-fetch all items from the DB — call after materialiseTemplates so newly
   *  inserted template items appear even if the Realtime push hasn't arrived. */
  refresh: () => Promise<void>;
  /** Slice 6: update the visibility on a job_item (optimistic + DB write). */
  setItemVisibility: (id: string, visibility: Visibility) => Promise<void>;
  /** Slice 6: update the visibility on a Drawings piece (optimistic + DB write). */
  setPieceVisibility: (id: string, visibility: Visibility) => Promise<void>;
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

function localLoadPieces(): JobPiece[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PIECES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JobPiece[]) : [];
  } catch {
    return [];
  }
}
function localSavePieces(pieces: JobPiece[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PIECES_STORAGE_KEY, JSON.stringify(pieces));
}

/**
 * Live per-job progress. Load + realtime sync run through the shared useLiveRows
 * module (one channel per table, idempotent patch-by-id); mutations are optimistic
 * with rollback via the shared optimistic() helper. React 18 defers functional-update
 * bodies, so useLiveRows' ref gives every mutator a deterministic, race-safe view;
 * patch-by-id is idempotent, so our own optimistic writes echo back harmlessly and
 * other clients' changes merge in (last-write-wins).
 */
export function useJobProgress(jobId: string): UseJobProgress {
  const backend: Backend = hasSupabase() ? "supabase" : "localStorage";
  const live = backend === "supabase";

  // Items: load + live-sync via the shared useLiveRows module (owns the channel
  // key, subscription, idempotent merge, and cleanup). Scoped to this job.
  const {
    rows: items,
    loading,
    setRows: setItemsRows,
    rowsRef: itemsRef,
  } = useLiveRows<JobItemRow, JobItem>({
    table: JOB_ITEMS_TABLE,
    live,
    resubscribeKey: jobId,
    filter: `job_id=eq.${jobId}`,
    rowToModel: rowToJobItem,
    getId: (i) => i.id,
    load: async () => {
      if (!live) return localLoad().filter((i) => i.jobId === jobId);
      const { data, error } = await getSupabase()
        .from(JOB_ITEMS_TABLE)
        .select("*")
        .eq("job_id", jobId);
      return !error && data ? (data as JobItemRow[]).map(rowToJobItem) : [];
    },
  });
  // Adapt the functional setter to optimistic()'s (next) => void shape.
  const setItems = useCallback((next: JobItem[]) => setItemsRows(() => next), [setItemsRows]);

  // ─── Slice 4: Drawings pieces for this job (project_id == jobId) ────────────
  const {
    rows: pieces,
    loading: piecesLoading,
    setRows: setPiecesRows,
    rowsRef: piecesRef,
  } = useLiveRows<PieceRow, JobPiece>({
    table: JOB_PIECES_TABLE,
    live,
    resubscribeKey: jobId,
    filter: `project_id=eq.${jobId}`,
    rowToModel: rowToPiece,
    getId: (p) => p.id,
    load: async () => {
      if (!live) return localLoadPieces().filter((p) => p.projectId === jobId);
      const { data, error } = await getSupabase()
        .from(JOB_PIECES_TABLE)
        .select("*")
        .eq("project_id", jobId);
      return !error && data ? (data as PieceRow[]).map(rowToPiece) : [];
    },
  });
  const setPieces = useCallback((next: JobPiece[]) => setPiecesRows(() => next), [setPiecesRows]);

  // Persist the localStorage fallback so a reload survives without Supabase.
  useEffect(() => {
    if (!loading && !live) {
      const others = localLoad().filter((i) => i.jobId !== jobId);
      localSave([...others, ...items]);
    }
  }, [items, loading, live, jobId]);

  // ─── Slice 4: pieces localStorage persistence ──────────────────────────────
  useEffect(() => {
    if (!piecesLoading && !live) {
      const others = localLoadPieces().filter((p) => p.projectId !== jobId);
      localSavePieces([...others, ...pieces]);
    }
  }, [pieces, piecesLoading, live, jobId]);

  const cycleItem = useCallback(
    async (id: string) => {
      const prev = itemsRef.current.find((x) => x.id === id);
      if (!prev) return;
      const merged: JobItem = {
        ...prev,
        status: nextStatus(prev.status),
        statusUpdatedAt: new Date().toISOString(),
      };
      await optimistic({
        ref: itemsRef,
        setState: setItems,
        apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
        rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase()
            .from(JOB_ITEMS_TABLE)
            .update({ status: merged.status, status_updated_at: merged.statusUpdatedAt })
            .eq("id", id);
          if (error) throw error;
        },
      });
      // Record the status change on the timeline only after a successful persist.
      // Fire-and-forget: the job_items write is the canonical fact; this is the
      // audit trail (recordStatusChange swallows its own errors by design).
      // job_item only — piece status-change events need a to_status model
      // decision (see the follow-up note in features/job-status/CLAUDE.md).
      if (backend === "supabase") {
        void recordStatusChange(jobId, id, "job_item", merged.status, merged.visibility);
      }
    },
    [backend, jobId]
  );

  // ─── Slice 4: cyclePiece — advance a Drawings piece through its pipeline ───
  const cyclePiece = useCallback(
    async (id: string) => {
      const prev = piecesRef.current.find((x) => x.id === id);
      if (!prev) return;
      const nextSt = drawingNextStatus(prev.kind, prev.status);
      // Already at terminal status — nothing to do.
      if (!nextSt) return;
      const merged: JobPiece = {
        ...prev,
        status: nextSt,
        statusUpdatedAt: new Date().toISOString(),
      };
      await optimistic({
        ref: piecesRef,
        setState: setPieces,
        apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
        rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase()
            .from(JOB_PIECES_TABLE)
            .update(pieceToRow(merged))
            .eq("id", id);
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  const addItem = useCallback(
    async (label: string, phase: JobItem["phase"]) => {
      const optimisticItem: JobItem = {
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
      await optimistic({
        ref: itemsRef,
        setState: setItems,
        apply: (cur) => [...cur, optimisticItem],
        rollback: (cur) => cur.filter((x) => x.id !== optimisticItem.id),
        persist: async () => {
          if (backend !== "supabase") return;
          const { data, error } = await getSupabase()
            .from(JOB_ITEMS_TABLE)
            .insert(jobItemToInsertRow(optimisticItem))
            .select()
            .single();
          if (error || !data) throw error ?? new Error("Insert returned no row");
          // Swap the optimistic row for the DB row (real id, defaults applied).
          const saved = rowToJobItem(data as JobItemRow);
          return itemsRef.current.map((x) => (x.id === optimisticItem.id ? saved : x));
        },
      });
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

  // ─── Slice 6: setItemVisibility — update visibility on a job_item ─────────
  const setItemVisibility = useCallback(
    async (id: string, visibility: Visibility) => {
      const prev = itemsRef.current.find((x) => x.id === id);
      if (!prev) return;
      const merged: JobItem = { ...prev, visibility };
      await optimistic({
        ref: itemsRef,
        setState: setItems,
        apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
        rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase()
            .from(JOB_ITEMS_TABLE)
            .update({ visibility })
            .eq("id", id);
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  // ─── Slice 6: setPieceVisibility — update visibility on a Drawings piece ──
  const setPieceVisibility = useCallback(
    async (id: string, visibility: Visibility) => {
      const prev = piecesRef.current.find((x) => x.id === id);
      if (!prev) return;
      const merged: typeof prev = { ...prev, visibility };
      await optimistic({
        ref: piecesRef,
        setState: setPieces,
        apply: (cur) => cur.map((x) => (x.id === id ? merged : x)),
        rollback: (cur) => cur.map((x) => (x.id === id ? prev : x)),
        persist: async () => {
          if (backend !== "supabase") return;
          const { error } = await getSupabase()
            .from(JOB_PIECES_TABLE)
            .update({ visibility })
            .eq("id", id);
          if (error) throw error;
        },
      });
    },
    [backend]
  );

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
      ),
    [items]
  );

  const sortedPieces = useMemo(
    () =>
      [...pieces].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
      ),
    [pieces]
  );

  const combinedLoading = loading || piecesLoading;

  return {
    items: sorted,
    pieces: sortedPieces,
    backend,
    loading: combinedLoading,
    cycleItem,
    cyclePiece,
    addItem,
    refresh,
    setItemVisibility,
    setPieceVisibility,
  };
}
