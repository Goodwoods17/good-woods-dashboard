import type { ApprovalStatus, DocumentApproval, ReviewerRole } from "./approvalRouting";

/** The `document_approvals` table row shape (snake_case columns). */
export type DocumentApprovalRow = {
  id: string;
  document_id: string;
  reviewer_role: string;
  status: string;
  reviewer_name: string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  created_by: string | null;
};

export function rowToApproval(row: DocumentApprovalRow): DocumentApproval {
  return {
    id: row.id,
    documentId: row.document_id,
    reviewerRole: row.reviewer_role as ReviewerRole,
    status: row.status as ApprovalStatus,
    reviewerName: row.reviewer_name,
    notes: row.notes,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export function approvalToRow(a: DocumentApproval): DocumentApprovalRow {
  return {
    id: a.id,
    document_id: a.documentId,
    reviewer_role: a.reviewerRole,
    status: a.status,
    reviewer_name: a.reviewerName,
    notes: a.notes,
    reviewed_at: a.reviewedAt,
    created_at: a.createdAt,
    created_by: null,
  };
}
