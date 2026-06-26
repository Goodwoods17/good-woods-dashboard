/**
 * Client-side helper: fetch the in-app processor status panel data (slice 2).
 *
 * Returns:
 *   - pendingCount: how many invoices are waiting to be extracted
 *   - lastRunAt: `updated_at` of the most-recently processed invoice (the
 *     closest timestamp we have to "when the sweep last ran", migration-free)
 *   - errorInvoices: invoices that errored out, with their readable reason
 *
 * We derive `lastRunAt` from the DB rather than storing a separate run-log
 * row, so this slice stays additive-only (no new migration needed).
 */
import { getSupabase, INVOICES_TABLE } from "@shared/lib/supabase";
import type { InvoiceRow } from "./invoiceRowMaps";
import type { Invoice } from "./types";
import { rowToInvoice } from "./invoiceRowMaps";

export type ProcessorStatus = {
  pendingCount: number;
  lastRunAt: string | null;
  errorInvoices: Invoice[];
};

/** Fetch the current processor status for the in-app status panel. */
export async function getProcessorStatus(): Promise<ProcessorStatus> {
  const sb = getSupabase();

  // Pending count.
  const { count: pendingCount, error: countErr } = await sb
    .from(INVOICES_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (countErr) throw countErr;

  // Last run at: max updated_at among non-pending invoices.
  const { data: lastRun, error: lastRunErr } = await sb
    .from(INVOICES_TABLE)
    .select("updated_at")
    .neq("status", "pending")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string }>();
  if (lastRunErr) throw lastRunErr;

  // Error invoices: all invoices at status `error`, newest first.
  const { data: errorRows, error: errorErr } = await sb
    .from(INVOICES_TABLE)
    .select("*")
    .eq("status", "error")
    .order("updated_at", { ascending: false });
  if (errorErr) throw errorErr;

  return {
    pendingCount: pendingCount ?? 0,
    lastRunAt: lastRun?.updated_at ?? null,
    errorInvoices: ((errorRows ?? []) as InvoiceRow[]).map(rowToInvoice),
  };
}
