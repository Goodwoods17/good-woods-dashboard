"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { JOB_ITEMS_TABLE, JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { useLiveRows } from "@shared/lib/useLiveRows";
import type { Job, JobPiece } from "@shared/lib/types";
import { rowToJobItem, type JobItemRow } from "./jobItemRowMap";
import { rowToPiece, type PieceRow } from "@features/drawings/lib/piecesRowMap";
import { toTrackableItems, piecesToTrackableItems } from "./adapter";
import type { TrackableItem } from "./types";

// ─── Pure helpers (exported for unit tests) ───────────────────────────────────

/**
 * Groups TrackableItems by their jobId, preserving insertion order within each
 * group. Used by the board to get per-job TrackableItem lists from the shared
 * flat array fetched in one query.
 */
export function groupItemsByJob(items: TrackableItem[]): Map<string, TrackableItem[]> {
  const map = new Map<string, TrackableItem[]>();
  for (const item of items) {
    if (!map.has(item.jobId)) map.set(item.jobId, []);
    map.get(item.jobId)!.push(item);
  }
  return map;
}

/** A job is "active" on the board unless its pipeline status is 'complete'. */
export function isActiveJob(job: Pick<Job, "pipelineStatus">): boolean {
  return job.pipelineStatus !== "complete";
}

// ─── LocalStorage fallback helpers ───────────────────────────────────────────

// These keys are intentionally the same as jobProgressStore so the board reads
// the same in-memory cache; both stores treat them as read-only from the same
// source of truth written by jobProgressStore.
const ITEMS_STORAGE_KEY = "gw_job_items_v1";
const PIECES_STORAGE_KEY = "gw_job_pieces_v1";

function localLoadItems(): TrackableItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEMS_STORAGE_KEY);
    return raw ? toTrackableItems(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function localLoadPieces(): TrackableItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PIECES_STORAGE_KEY);
    return raw ? piecesToTrackableItems(JSON.parse(raw) as JobPiece[]) : [];
  } catch {
    return [];
  }
}

// ─── useStatusBoard hook ──────────────────────────────────────────────────────

export type StatusBoardData = {
  /** Flat TrackableItems grouped by jobId. Empty array for a job with no items. */
  byJobId: Map<string, TrackableItem[]>;
  loading: boolean;
};

/**
 * Fetches and live-syncs progress for all supplied jobIds as two live-synced
 * streams (job_items + Drawings pieces), each mapped to the unified TrackableItem
 * via the adapter and merged by the shared useLiveRows module. The realtime
 * subscriptions watch ALL rows on those tables (no server-side filter); the
 * `accept` predicate drops any change outside the tracked job set, keeping the
 * board hot without one channel per job.
 */
export function useStatusBoard(jobIds: string[]): StatusBoardData {
  const live = hasSupabase();

  // Stable string key for re-subscribe — sorted so order doesn't matter.
  const joinKey = [...jobIds].sort().join(",");

  // Keep a ref so the realtime accept-predicate filters in-memory without a stale
  // closure when the tracked job set changes between renders.
  const jobIdsSetRef = useRef<Set<string>>(new Set(jobIds));
  useEffect(() => {
    jobIdsSetRef.current = new Set(jobIds);
  }, [jobIds]);

  const accept = useCallback((t: TrackableItem) => jobIdsSetRef.current.has(t.jobId), []);

  const { rows: itemRows, loading: itemsLoading } = useLiveRows<JobItemRow, TrackableItem>({
    table: JOB_ITEMS_TABLE,
    live,
    resubscribeKey: joinKey,
    rowToModel: (r) => toTrackableItems([rowToJobItem(r)])[0],
    getId: (t) => t.id,
    accept,
    load: async () => {
      if (!live) return localLoadItems();
      if (jobIds.length === 0) return [];
      const { data, error } = await getSupabase()
        .from(JOB_ITEMS_TABLE)
        .select("*")
        .in("job_id", jobIds);
      return error || !data ? [] : toTrackableItems((data as JobItemRow[]).map(rowToJobItem));
    },
  });

  const { rows: pieceRows, loading: piecesLoading } = useLiveRows<PieceRow, TrackableItem>({
    table: JOB_PIECES_TABLE,
    live,
    resubscribeKey: joinKey,
    rowToModel: (r) => piecesToTrackableItems([rowToPiece(r)])[0],
    getId: (t) => t.id,
    accept,
    load: async () => {
      if (!live) return localLoadPieces();
      if (jobIds.length === 0) return [];
      const { data, error } = await getSupabase()
        .from(JOB_PIECES_TABLE)
        .select("*")
        .in("project_id", jobIds);
      return error || !data ? [] : piecesToTrackableItems((data as PieceRow[]).map(rowToPiece));
    },
  });

  const byJobId = useMemo(
    () => groupItemsByJob([...itemRows, ...pieceRows]),
    [itemRows, pieceRows]
  );

  return { byJobId, loading: itemsLoading || piecesLoading };
}
