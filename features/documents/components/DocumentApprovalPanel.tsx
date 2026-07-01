"use client";

import { useMemo, useState } from "react";
import { Check, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { PillButton } from "@shared/components/ui/PillButton";
import {
  APPROVAL_STATUS_META,
  REVIEWER_ROLES,
  REVIEWER_ROLE_LABELS,
  approvedCount,
  computeRoutingStatus,
  type ApprovalStatus,
  type ReviewerRole,
} from "../lib/approvalRouting";
import { useDocumentApprovals } from "../lib/documentApprovalsStore";

/**
 * S12 — parallel approval routing panel for a shop drawing. Routes the document
 * to architect + GC + PM at once; each reviewer leaves a status; the document
 * only reads Approved once all three sign off. Three-status colour system from
 * approvalRouting.ts. Owner-side; gated behind the project-files flag by the
 * caller (DocumentsCard).
 */
export function DocumentApprovalPanel({
  documentId,
  jobId,
  jobName,
}: {
  documentId: string;
  jobId: string;
  jobName?: string;
}) {
  const { approvals, busy, hydrated, reviewing, routed, requestApprovals, review } =
    useDocumentApprovals(documentId, jobName);
  const [error, setError] = useState<string | null>(null);

  async function handleRoute() {
    setError(null);
    try {
      await requestApprovals(jobId);
    } catch {
      setError("Couldn't route for approval — try again.");
    }
  }

  async function handleReview(role: ReviewerRole, status: ApprovalStatus) {
    setError(null);
    try {
      await review(role, status);
    } catch {
      setError("Couldn't save that verdict — try again.");
    }
  }

  const overall = useMemo(() => computeRoutingStatus(approvals), [approvals]);
  const approved = useMemo(() => approvedCount(approvals), [approvals]);
  const overallMeta = APPROVAL_STATUS_META[overall];

  const statusByRole = useMemo(() => {
    const m = new Map<ReviewerRole, ApprovalStatus>();
    for (const a of approvals) m.set(a.reviewerRole, a.status);
    return m;
  }, [approvals]);

  return (
    <section
      data-testid="document-approval-panel"
      className="border-t border-hairline px-6 py-4 w-full text-left"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
          <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary font-semibold">
            Approval routing
          </span>
        </div>
        {routed && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-text-tertiary">
              {approved} of {REVIEWER_ROLES.length} approved
            </span>
            <StatusPill status={overall} testId="approval-overall-status" />
          </div>
        )}
      </div>

      {error ? (
        <p data-testid="approval-error" role="alert" className="mb-2 text-xs text-status-blocked">
          {error}
        </p>
      ) : null}

      {!hydrated ? (
        <p data-testid="approval-loading" className="text-xs text-text-tertiary" aria-live="polite">
          Loading approval routing…
        </p>
      ) : !routed ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-tertiary max-w-xs">
            Route this drawing to the architect, GC, and PM at once. It moves to Approved only after
            all three sign off.
          </p>
          <PillButton
            data-testid="approval-route-btn"
            disabled={busy}
            onClick={() => void handleRoute()}
          >
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
            Route for approval
          </PillButton>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {REVIEWER_ROLES.map((role) => {
            const status = statusByRole.get(role) ?? "pending";
            const rowBusy = reviewing.includes(role);
            return (
              <li
                key={role}
                data-testid="approval-reviewer-row"
                data-role={role}
                data-status={status}
                className="flex items-center justify-between gap-3 rounded-md bg-surface-muted/40 px-3 py-1.5"
              >
                <span className="text-xs font-medium text-text-primary">
                  {REVIEWER_ROLE_LABELS[role]}
                </span>
                <div className="flex items-center gap-2">
                  <StatusPill status={status} />
                  <button
                    type="button"
                    data-testid="approval-approve"
                    title="Approve"
                    disabled={rowBusy}
                    onClick={() => void handleReview(role, "approved")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full h-6 w-6 duration-fast",
                      "text-text-tertiary hover:text-status-on-track hover:bg-status-on-track-soft/40",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
                      "disabled:opacity-50 disabled:pointer-events-none",
                      status === "approved" && "text-status-on-track bg-status-on-track-soft/40"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    data-testid="approval-reject"
                    title="Needs revision"
                    disabled={rowBusy}
                    onClick={() => void handleReview(role, "needs_revision")}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full h-6 w-6 duration-fast",
                      "text-text-tertiary hover:text-status-blocked hover:bg-status-blocked-soft/40",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
                      "disabled:opacity-50 disabled:pointer-events-none",
                      status === "needs_revision" && "text-status-blocked bg-status-blocked-soft/40"
                    )}
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status, testId }: { status: ApprovalStatus; testId?: string }) {
  const meta = APPROVAL_STATUS_META[status];
  return (
    <span
      data-testid={testId}
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0",
        "text-[10px] uppercase tracking-[0.06em] font-medium",
        meta.pillClass
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} />
      {meta.label}
    </span>
  );
}
