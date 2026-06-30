"use client";

/**
 * Store seam for parallel approval routing on shop drawings (S12, milestone #12,
 * issue #226). Owns the authenticated Supabase I/O for the
 * `DocumentApprovalPanel`: load a document's routing slots, route it to all
 * reviewers at once, and record each reviewer's verdict. The logged-in browser
 * client writes under RLS `document_approvals_authenticated_all`; anon never
 * touches this table.
 *
 * "Notify architect + GC + PM at once" reuses the existing notification queue
 * (`scheduling_notifications`) — routing enqueues one `approval_request` draft
 * per reviewer so the same per-client cap / send pipeline carries the asks. The
 * enqueue is best-effort: a failed notification never blocks the routing itself.
 */
import { useCallback, useEffect, useState } from "react";
import { DOCUMENT_APPROVALS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { SCHEDULING_NOTIFICATIONS_TABLE } from "@features/scheduling/lib/notificationsRowMap";
import {
  REVIEWER_ROLES,
  REVIEWER_ROLE_LABELS,
  makePendingApprovals,
  type ApprovalStatus,
  type DocumentApproval,
  type ReviewerRole,
} from "./approvalRouting";
import {
  approvalToRow,
  rowToApproval,
  type DocumentApprovalRow,
} from "./documentApprovalsRowMap";

async function loadApprovals(documentId: string): Promise<DocumentApproval[]> {
  if (!hasSupabase() || !documentId) return [];
  const { data } = await getSupabase()
    .from(DOCUMENT_APPROVALS_TABLE)
    .select("*")
    .eq("document_id", documentId)
    .order("reviewer_role", { ascending: true });
  return ((data as DocumentApprovalRow[] | null) ?? []).map(rowToApproval);
}

export type UseDocumentApprovals = {
  approvals: DocumentApproval[];
  busy: boolean;
  /** Whether the document has been routed yet (any slot exists). */
  routed: boolean;
  /** Route the document to every required reviewer at once + enqueue notices. */
  requestApprovals: (jobId: string) => Promise<void>;
  /** Record one reviewer's verdict. */
  review: (role: ReviewerRole, status: ApprovalStatus, reviewerName?: string | null) => Promise<void>;
};

export function useDocumentApprovals(
  documentId: string,
  jobName?: string
): UseDocumentApprovals {
  const [approvals, setApprovals] = useState<DocumentApproval[]>([]);
  const [busy, setBusy] = useState(false);
  const supabaseReady = hasSupabase();

  const refresh = useCallback(async () => {
    if (!supabaseReady) return;
    setApprovals(await loadApprovals(documentId));
  }, [supabaseReady, documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestApprovals = useCallback(
    async (jobId: string) => {
      if (!supabaseReady || busy || !documentId) return;
      setBusy(true);
      try {
        const rows: DocumentApprovalRow[] = makePendingApprovals(documentId, REVIEWER_ROLES).map(
          (a) => approvalToRow({ ...a, id: crypto.randomUUID() })
        );
        // Idempotent: re-routing upserts the per-(document,role) slot.
        const { error } = await getSupabase()
          .from(DOCUMENT_APPROVALS_TABLE)
          .upsert(rows, { onConflict: "document_id,reviewer_role" });
        if (error) return;
        setApprovals(rows.map(rowToApproval));

        // Reuse the notification queue: one draft per reviewer, addressed by role.
        const label = jobName?.trim() ? jobName.trim() : "a shop drawing";
        const drafts = REVIEWER_ROLES.map((role) => ({
          id: crypto.randomUUID(),
          job_id: jobId,
          kind: "approval_request",
          recipient_contact_id: null,
          recipient_email: null,
          subject: `Drawing approval requested — ${label}`,
          body: `${REVIEWER_ROLE_LABELS[role]}: please review and sign off on ${label}.`,
          status: "pending_approval",
          created_by: null,
        }));
        // Best-effort — a notification failure must not unwind the routing.
        await getSupabase().from(SCHEDULING_NOTIFICATIONS_TABLE).insert(drafts);
      } finally {
        setBusy(false);
      }
    },
    [busy, supabaseReady, documentId, jobName]
  );

  const review = useCallback(
    async (
      role: ReviewerRole,
      status: ApprovalStatus,
      reviewerName: string | null = null
    ) => {
      if (!supabaseReady || !documentId) return;
      const reviewedAt = status === "pending" ? null : new Date().toISOString();
      // Optimistic local update first.
      setApprovals((prev) =>
        prev.map((a) =>
          a.reviewerRole === role ? { ...a, status, reviewedAt, reviewerName } : a
        )
      );
      await getSupabase()
        .from(DOCUMENT_APPROVALS_TABLE)
        .update({ status, reviewed_at: reviewedAt, reviewer_name: reviewerName })
        .eq("document_id", documentId)
        .eq("reviewer_role", role);
    },
    [supabaseReady, documentId]
  );

  return {
    approvals,
    busy,
    routed: approvals.length > 0,
    requestApprovals,
    review,
  };
}
