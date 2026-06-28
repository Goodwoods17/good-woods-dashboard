"use client";

/**
 * S17 — Store seam for priority bumps (public.priority_bumps).
 *
 * Owns the Supabase insert for the bump audit record so PriorityBumpPanel stays
 * render-of-state. The pure `buildPriorityBumpRecord` assembly and the `onBump`
 * orchestration stay in the component; this store only persists the audit row.
 */
import { getSupabase, hasSupabase, PRIORITY_BUMPS_TABLE } from "@shared/lib/supabase";
import type { PriorityBumpRecord } from "./priorityBump";
import { priorityBumpRecordToRow } from "./priorityBumpRowMap";

/** Insert one immutable priority-bump audit row (no-op when offline). */
export async function insertPriorityBump(record: PriorityBumpRecord): Promise<void> {
  if (!hasSupabase()) return;
  await getSupabase().from(PRIORITY_BUMPS_TABLE).insert(priorityBumpRecordToRow(record));
}
