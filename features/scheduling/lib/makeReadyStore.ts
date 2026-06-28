"use client";

/**
 * S12 — Store seam for the make-ready checklist (public.scheduling_make_ready_items).
 *
 * Owns all Supabase I/O for the per-job readiness state so MakeReadyChecklistPanel
 * stays render-of-state: it loads saved rows, merges them onto the standard items
 * (pure `buildMakeReadyItems`), and upserts a single item's check/override state.
 * The component reads `itemsByPhase` and calls `updateItem`; it never touches
 * Supabase directly. Auto-signals are applied by the component at render time.
 */
import { useCallback, useEffect, useState } from "react";
import { getSupabase, hasSupabase, SCHEDULING_MAKE_READY_ITEMS_TABLE } from "@shared/lib/supabase";
import { MILESTONE_STAGES } from "@shared/lib/types";
import type { MilestoneStage } from "@shared/lib/types";
import { buildMakeReadyItems, type MakeReadyItem } from "./makeReady";
import {
  makeReadyItemToRow,
  rowToSavedMakeReadyState,
  type SavedMakeReadyState,
  type SchedulingMakeReadyReadRow,
} from "./schedulingMakeReadyRowMap";

/** Load the saved per-job make-ready state from Supabase (empty when offline). */
export async function loadMakeReadyState(jobId: string): Promise<SavedMakeReadyState[]> {
  if (!hasSupabase()) return [];
  const { data, error } = await getSupabase()
    .from(SCHEDULING_MAKE_READY_ITEMS_TABLE)
    .select("template_item_id, checked, overridden")
    .eq("job_id", jobId);
  if (error || !data) return [];
  return (data as SchedulingMakeReadyReadRow[]).map(rowToSavedMakeReadyState);
}

/** Upsert a single (merged) item's state, keyed on (job_id, template_item_id). */
export async function saveMakeReadyItem(jobId: string, item: MakeReadyItem): Promise<void> {
  if (!hasSupabase()) return;
  await getSupabase()
    .from(SCHEDULING_MAKE_READY_ITEMS_TABLE)
    .upsert(makeReadyItemToRow(jobId, item), { onConflict: "job_id,template_item_id" });
}

type ItemsByPhase = Partial<Record<MilestoneStage, MakeReadyItem[]>>;

export type UseMakeReady = {
  itemsByPhase: ItemsByPhase;
  loading: boolean;
  busyId: string | null;
  error: string | null;
  updateItem: (
    phase: MilestoneStage,
    itemId: string,
    update: Partial<Pick<MakeReadyItem, "checked" | "overridden">>
  ) => Promise<void>;
};

/**
 * Hook wrapping the make-ready persistence with the same local state shape the
 * panel previously managed inline (itemsByPhase / loading / busyId / error).
 */
export function useMakeReady(jobId: string): UseMakeReady {
  const [itemsByPhase, setItemsByPhase] = useState<ItemsByPhase>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const saved = await loadMakeReadyState(jobId);
        if (cancelled) return;
        const built: ItemsByPhase = {};
        for (const { key } of MILESTONE_STAGES) {
          built[key] = buildMakeReadyItems(key, saved);
        }
        setItemsByPhase(built);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const updateItem = useCallback(
    async (
      phase: MilestoneStage,
      itemId: string,
      update: Partial<Pick<MakeReadyItem, "checked" | "overridden">>
    ) => {
      setBusyId(itemId);
      setError(null);
      try {
        const currentItems = itemsByPhase[phase] ?? [];
        const item = currentItems.find((i) => i.id === itemId);
        if (!item) return;

        const updated = { ...item, ...update };
        await saveMakeReadyItem(jobId, updated);

        setItemsByPhase((prev) => ({
          ...prev,
          [phase]: (prev[phase] ?? []).map((i) => (i.id === itemId ? updated : i)),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setBusyId(null);
      }
    },
    [itemsByPhase, jobId]
  );

  return { itemsByPhase, loading, busyId, error, updateItem };
}
