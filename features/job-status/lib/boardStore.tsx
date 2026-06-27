"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { JOB_ITEMS_TABLE, JOB_PIECES_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
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

function localLoadAllTrackable(): TrackableItem[] {
  if (typeof window === "undefined") return [];
  try {
    const rawItems = window.localStorage.getItem(ITEMS_STORAGE_KEY);
    const rawPieces = window.localStorage.getItem(PIECES_STORAGE_KEY);
    const items = rawItems ? toTrackableItems(JSON.parse(rawItems)) : [];
    const pieces = rawPieces ? piecesToTrackableItems(JSON.parse(rawPieces) as JobPiece[]) : [];
    return [...items, ...pieces];
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
 * Fetches and live-syncs progress data for all supplied jobIds in a single pair
 * of queries (job_items + job_pieces). Subscribes to ALL changes on those tables
 * (no DB-side filter) and merges updates that belong to the tracked job set, so
 * a single Realtime push on any job's items reflects on the board immediately.
 *
 * Mirrors the pattern from jobProgressStore.tsx (per-instance channel key,
 * idempotent patch-by-id, localStorage fallback).
 */
export function useStatusBoard(jobIds: string[]): StatusBoardData {
  const backend = hasSupabase() ? "supabase" : "localStorage";

  const [allItems, setAllItems] = useState<TrackableItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable string key for the effect deps — sorted so order doesn't matter.
  const joinKey = [...jobIds].sort().join(",");

  // Keep a ref so the realtime callback can filter in-memory without stale closure.
  const jobIdsSetRef = useRef<Set<string>>(new Set(jobIds));
  useEffect(() => {
    jobIdsSetRef.current = new Set(jobIds);
  }, [jobIds]);

  // Per-instance channel key prevents duplicate-subscriber errors when multiple
  // board instances (or board + drill-in) coexist in the same page.
  const channelKeyRef = useRef<string | null>(null);
  if (channelKeyRef.current === null) {
    channelKeyRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r${Math.random().toString(36).slice(2)}`;
  }

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (backend === "localStorage") {
        if (!cancelled) {
          // In localStorage mode read everything; the board filters by active jobIds
          // from the jobs store — we don't need to filter here since groupItemsByJob
          // and the board itself only surface tracked job IDs.
          setAllItems(localLoadAllTrackable());
          setLoading(false);
        }
        return;
      }

      if (jobIds.length === 0) {
        if (!cancelled) {
          setAllItems([]);
          setLoading(false);
        }
        return;
      }

      const sb = getSupabase();
      const [itemsRes, piecesRes] = await Promise.all([
        sb.from(JOB_ITEMS_TABLE).select("*").in("job_id", jobIds),
        sb.from(JOB_PIECES_TABLE).select("*").in("project_id", jobIds),
      ]);

      if (!cancelled) {
        const items = toTrackableItems(
          (itemsRes.error || !itemsRes.data ? [] : (itemsRes.data as JobItemRow[])).map(
            rowToJobItem
          )
        );
        const pieces = piecesToTrackableItems(
          (piecesRes.error || !piecesRes.data ? [] : (piecesRes.data as PieceRow[])).map(rowToPiece)
        );
        setAllItems([...items, ...pieces]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, joinKey]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  // Subscribe to ALL rows on job_items and job_pieces (no server-side filter) —
  // then drop any change that isn't in our tracked job set. This keeps the board
  // hot without one channel per job. The per-instance suffix keeps the channel
  // name unique even when two boards coexist.
  useEffect(() => {
    if (backend !== "supabase") return;
    const sb = getSupabase();

    const itemsChannel = sb
      .channel(`board_job_items_${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: JOB_ITEMS_TABLE },
        (payload) => {
          setAllItems((cur) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string })?.id;
              return id ? cur.filter((x) => !(x.kind === "job_item" && x.id === id)) : cur;
            }
            const jobItem = rowToJobItem(payload.new as JobItemRow);
            if (!jobIdsSetRef.current.has(jobItem.jobId)) return cur;
            const trackable: TrackableItem = {
              id: jobItem.id,
              jobId: jobItem.jobId,
              phase: jobItem.phase,
              label: jobItem.label,
              done: jobItem.status === "done",
              kind: "job_item",
              sortOrder: jobItem.sortOrder,
            };
            const exists = cur.some((x) => x.kind === "job_item" && x.id === trackable.id);
            return exists
              ? cur.map((x) => (x.kind === "job_item" && x.id === trackable.id ? trackable : x))
              : [...cur, trackable];
          });
        }
      )
      .subscribe();

    const piecesChannel = sb
      .channel(`board_job_pieces_${channelKeyRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: JOB_PIECES_TABLE },
        (payload) => {
          setAllItems((cur) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string })?.id;
              return id ? cur.filter((x) => !(x.kind === "piece" && x.id === id)) : cur;
            }
            const piece = rowToPiece(payload.new as PieceRow);
            if (!jobIdsSetRef.current.has(piece.projectId)) return cur;
            const [trackable] = piecesToTrackableItems([piece]);
            const exists = cur.some((x) => x.kind === "piece" && x.id === trackable.id);
            return exists
              ? cur.map((x) => (x.kind === "piece" && x.id === trackable.id ? trackable : x))
              : [...cur, trackable];
          });
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(itemsChannel);
      sb.removeChannel(piecesChannel);
    };
  }, [backend]); // only reconnect on backend change; jobIdsSetRef stays current via ref

  const byJobId = useMemo(() => groupItemsByJob(allItems), [allItems]);

  return { byJobId, loading };
}
