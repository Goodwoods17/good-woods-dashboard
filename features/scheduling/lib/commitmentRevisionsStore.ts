"use client";

/**
 * S14 — Store seam for commitment revisions (public.commitment_revisions).
 *
 * Owns the Supabase read (per job, newest first) + insert so RecommitPanel stays
 * render-of-state. The pure `buildCommitmentRevision` assembly and the
 * `onRecommit` orchestration stay in the component; this store only persists.
 */
import { useCallback, useEffect, useState } from "react";
import { getSupabase, hasSupabase, COMMITMENT_REVISIONS_TABLE } from "@shared/lib/supabase";
import type { CommitmentRevision } from "./recommit";
import {
  commitmentRevisionToRow,
  rowToCommitmentRevision,
  type CommitmentRevisionRow,
} from "./commitmentRevisionsRowMap";

/** Load a job's revision history, newest first (empty when offline). */
export async function loadCommitmentRevisions(jobId: string): Promise<CommitmentRevision[]> {
  if (!hasSupabase()) return [];
  const { data, error } = await getSupabase()
    .from(COMMITMENT_REVISIONS_TABLE)
    .select(
      "id, job_id, kind, reason_code, old_committed_date, new_committed_date, old_buffer_days, new_buffer_days, dings_reliability, note, revised_by, revised_at"
    )
    .eq("job_id", jobId)
    .order("revised_at", { ascending: false });
  if (error || !data) return [];
  return (data as CommitmentRevisionRow[]).map(rowToCommitmentRevision);
}

/** Insert one immutable revision row (no-op when offline). */
export async function insertCommitmentRevision(rev: CommitmentRevision): Promise<void> {
  if (!hasSupabase()) return;
  await getSupabase().from(COMMITMENT_REVISIONS_TABLE).insert(commitmentRevisionToRow(rev));
}

export type UseCommitmentRevisions = {
  revisions: CommitmentRevision[];
  loading: boolean;
  reload: () => Promise<void>;
};

export function useCommitmentRevisions(jobId: string): UseCommitmentRevisions {
  const [revisions, setRevisions] = useState<CommitmentRevision[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRevisions(await loadCommitmentRevisions(jobId));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { revisions, loading, reload };
}
