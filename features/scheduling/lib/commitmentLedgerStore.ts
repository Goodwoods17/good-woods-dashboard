"use client";

/**
 * S13 — Store seam for the commitment ledger (public.commitment_ledger).
 *
 * Owns the Supabase read for the per-owner reliability history so
 * CommitmentLedgerPanel stays render-of-state. The ledger entries themselves are
 * derived purely from the Job (`buildCommitmentLedger`) in the component; this
 * store only fetches the durable date-keeping outcomes that feed the per-owner
 * roll-up (read across all jobs, as the panel always has).
 */
import { useEffect, useState } from "react";
import { getSupabase, hasSupabase, COMMITMENT_LEDGER_TABLE } from "@shared/lib/supabase";
import type { OwnerReliabilityRecord } from "./commitmentLedger";
import { rowToOwnerReliabilityRecord, type CommitmentLedgerRow } from "./commitmentLedgerRowMap";

/** Load every persisted commitment outcome (empty when offline). */
export async function loadCommitmentLedger(): Promise<OwnerReliabilityRecord[]> {
  if (!hasSupabase()) return [];
  const { data, error } = await getSupabase()
    .from(COMMITMENT_LEDGER_TABLE)
    .select("owner_kind, owner_id, owner_name, committed_date, actual_date, missed");
  if (error || !data) return [];
  return (data as CommitmentLedgerRow[]).map(rowToOwnerReliabilityRecord);
}

export type UseCommitmentLedger = {
  records: OwnerReliabilityRecord[];
  loading: boolean;
};

export function useCommitmentLedger(): UseCommitmentLedger {
  const [records, setRecords] = useState<OwnerReliabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const rows = await loadCommitmentLedger();
        if (!cancelled) setRecords(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { records, loading };
}
