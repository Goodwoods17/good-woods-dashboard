"use client";

/**
 * S25 — Store seam for the PPC + on-time delivery reliability scorecard
 * (issue #113). Fetches the cross-job aggregate from `commitment_ledger` and
 * `commitment_revisions`, then delegates to the pure `buildReliabilityScorecard`
 * for computation. Ships behind NEXT_PUBLIC_SCHEDULING_P6_ENABLED.
 */
import { useEffect, useState } from "react";
import {
  getSupabase,
  hasSupabase,
  COMMITMENT_LEDGER_TABLE,
  COMMITMENT_REVISIONS_TABLE,
} from "@shared/lib/supabase";
import {
  buildReliabilityScorecard,
  type ScorecardLedgerEntry,
  type ScorecardRevisionEntry,
  type ReliabilityScorecard,
} from "./ppc";

// ── Raw row types (subset of what the DB returns) ────────────────────────────

type LedgerRow = {
  level: "client" | "phase";
  status: "open" | "kept" | "missed";
  missed: boolean;
};

type RevisionRow = {
  reason_code: string;
  dings_reliability: boolean;
};

// ── Loader helpers ────────────────────────────────────────────────────────────

async function loadLedgerEntries(): Promise<ScorecardLedgerEntry[]> {
  if (!hasSupabase()) return [];
  const { data, error } = await getSupabase()
    .from(COMMITMENT_LEDGER_TABLE)
    .select("level, status, missed");
  if (error || !data) return [];
  return (data as LedgerRow[]).map((row) => ({
    level: row.level,
    status: row.status,
    missed: row.missed,
  }));
}

async function loadRevisionEntries(): Promise<ScorecardRevisionEntry[]> {
  if (!hasSupabase()) return [];
  const { data, error } = await getSupabase()
    .from(COMMITMENT_REVISIONS_TABLE)
    .select("reason_code, dings_reliability");
  if (error || !data) return [];
  return (data as RevisionRow[]).map((row) => ({
    reasonCode: row.reason_code,
    dingsReliability: row.dings_reliability,
  }));
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type UseScorecardData = {
  scorecard: ReliabilityScorecard | null;
  loading: boolean;
};

/**
 * Loads the shop-wide PPC + on-time delivery scorecard.
 * Data spans all jobs (no per-job filter) — this is a shop-level aggregate.
 * Returns null scorecard while loading or when offline.
 */
export function useScorecardData(): UseScorecardData {
  const [scorecard, setScorecard] = useState<ReliabilityScorecard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [ledger, revisions] = await Promise.all([
          loadLedgerEntries(),
          loadRevisionEntries(),
        ]);
        if (!cancelled) {
          setScorecard(buildReliabilityScorecard(ledger, revisions));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { scorecard, loading };
}
