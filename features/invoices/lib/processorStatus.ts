/**
 * Slice 2 — in-app processor status. Derives the pending count and "last run
 * at" timestamp from the `invoices` table without requiring a separate tracking
 * table (additive-only constraint; ADR 0019 overnight build).
 *
 * "Last run at" = the most recent `updated_at` on any invoice that has moved
 * past `pending` (i.e. is at `needs_review`, `reviewed`, `posted`, or `error`).
 * That timestamp is set by Supabase whenever the sweep writes back results.
 */
import { getSupabase, INVOICES_TABLE } from "@shared/lib/supabase";

export type ProcessorStatus = {
  /** Number of invoices currently at `pending`. */
  pendingCount: number;
  /** ISO timestamp of when the sweep last ran; null if nothing has ever been processed. */
  lastRunAt: string | null;
};

/** Fetch the current processor status from Supabase. */
export async function getProcessorStatus(): Promise<ProcessorStatus> {
  const sb = getSupabase();

  // Parallel: count pending + find last-run-at.
  const [pendingRes, lastRunRes] = await Promise.all([
    sb
      .from(INVOICES_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    sb
      .from(INVOICES_TABLE)
      .select("updated_at")
      .not("status", "eq", "pending")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string }>(),
  ]);

  if (pendingRes.error) throw pendingRes.error;
  if (lastRunRes.error) throw lastRunRes.error;

  return {
    pendingCount: pendingRes.count ?? 0,
    lastRunAt: lastRunRes.data?.updated_at ?? null,
  };
}
