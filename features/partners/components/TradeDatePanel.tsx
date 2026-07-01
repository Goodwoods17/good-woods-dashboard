"use client";

/**
 * S11 — Trade-line date wiring. Renders inside TradeLineRow when a subtrade is
 * assigned and NEXT_PUBLIC_SCHEDULING_ENABLED is on.
 *
 * Three date states:
 *   No dates set     → show "Requested date" + "Confirmed date" inputs, both empty
 *   Requested only   → show requested date chip + "Awaiting confirmation" + confirm button
 *   Both set         → show both dates + "Confirmed" badge OR "Missed" warning
 *
 * "Request via email" generates a token server-side (a future route) and falls
 * back to a mailto: draft in this slice. "Record after call" lets the owner type
 * the sub's committed date directly into an inline input.
 */

import { useState } from "react";
import { Calendar, CheckCircle2, AlertCircle, Mail, Pencil } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { JobTrade } from "../lib/types";
import {
  shouldAutoRaiseMissedBlocker,
  missedSubDateBlockerReason,
} from "@features/scheduling/lib/tradeDates";

type Props = {
  line: JobTrade;
  onUpdate: (patch: Partial<JobTrade>) => void;
  /**
   * Optional subtrade name for generating the auto-raise blocker reason text.
   * When omitted the reason falls back to a generic label.
   */
  subtradeName?: string;
  /**
   * Optional trade label for generating the auto-raise blocker reason text.
   * When omitted the reason falls back to a generic label.
   */
  tradeName?: string;
};

type DateMode = "view" | "edit-requested" | "edit-committed";

export function TradeDatePanel({
  line,
  onUpdate,
  subtradeName = "Sub",
  tradeName = "trade",
}: Props) {
  const today = new Date();
  const isMissed = shouldAutoRaiseMissedBlocker(line.subCommittedDate, line.status, today);

  const [mode, setMode] = useState<DateMode>("view");
  const [draftRequested, setDraftRequested] = useState(line.requestedDate ?? "");
  const [draftCommitted, setDraftCommitted] = useState(line.subCommittedDate ?? "");

  function commitRequested() {
    const value = draftRequested.trim() || null;
    onUpdate({ requestedDate: value });
    setMode("view");
  }

  function commitSubDate() {
    const value = draftCommitted.trim() || null;
    const now = value ? new Date().toISOString() : null;
    onUpdate({
      subCommittedDate: value,
      confirmedAt: now,
      confirmationToken: null,
      tokenExpiresAt: null,
    });
    setMode("view");
  }

  function handleAutoRaiseBanner() {
    const reason = missedSubDateBlockerReason(
      tradeName,
      subtradeName,
      line.subCommittedDate ?? "unknown date"
    );
    // In S11 the auto-raise is surfaced as a copy-to-use reason text.
    // The actual blocker insert is a future server action (the owner creates it
    // from the job blockers panel using this reason as the pre-filled text).
    alert(
      `Suggested blocker reason:\n\n"${reason}"\n\n` +
        "Copy this into the Blockers section to raise it on the job."
    );
  }

  return (
    <div
      data-testid="trade-date-panel"
      className="mt-3 pt-3 border-t border-hairline space-y-2 pl-0.5"
    >
      {/* Requested date row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.04em] text-text-tertiary">
          <Calendar className="h-3 w-3" strokeWidth={1.75} />
          Requested
        </span>

        {mode === "edit-requested" ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              type="date"
              value={draftRequested}
              onChange={(e) => setDraftRequested(e.target.value)}
              aria-label="Requested date"
              data-testid="trade-requested-date-input"
              className="min-h-[28px] rounded-md border border-border bg-surface px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
            />
            <button
              type="button"
              onClick={commitRequested}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors duration-fast"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftRequested(line.requestedDate ?? "");
                setMode("view");
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftRequested(line.requestedDate ?? "");
              setMode("edit-requested");
            }}
            data-testid="trade-requested-date-trigger"
            className={cn(
              "text-xs transition-colors duration-fast",
              line.requestedDate
                ? "text-text-primary hover:text-accent inline-flex items-center gap-1"
                : "text-text-tertiary hover:text-text-secondary inline-flex items-center gap-1"
            )}
          >
            <Pencil className="h-3 w-3" strokeWidth={1.75} />
            {line.requestedDate ? line.requestedDate : "Set date"}
          </button>
        )}
      </div>

      {/* Sub committed date row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.04em] text-text-tertiary">
          <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} />
          Sub confirmed
        </span>

        {mode === "edit-committed" ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              type="date"
              value={draftCommitted}
              onChange={(e) => setDraftCommitted(e.target.value)}
              aria-label="Sub confirmed date"
              data-testid="trade-committed-date-input"
              className="min-h-[28px] rounded-md border border-border bg-surface px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
            />
            <button
              type="button"
              onClick={commitSubDate}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors duration-fast"
            >
              Record
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftCommitted(line.subCommittedDate ?? "");
                setMode("view");
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast"
            >
              Cancel
            </button>
          </span>
        ) : line.subCommittedDate ? (
          <span className="inline-flex items-center gap-2">
            <span
              data-testid={isMissed ? "trade-date-missed" : "trade-date-confirmed"}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                isMissed
                  ? "bg-status-blocked/10 text-status-blocked"
                  : "bg-status-on-track/10 text-status-on-track"
              )}
            >
              {isMissed ? (
                <>
                  <AlertCircle className="h-3 w-3" strokeWidth={1.75} />
                  Missed {line.subCommittedDate}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" strokeWidth={1.75} />
                  {line.subCommittedDate}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraftCommitted(line.subCommittedDate ?? "");
                setMode("edit-committed");
              }}
              data-testid="trade-date-edit-committed"
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast"
            >
              Edit
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Awaiting confirmation</span>
            <button
              type="button"
              onClick={() => {
                setDraftCommitted("");
                setMode("edit-committed");
              }}
              data-testid="trade-date-record-btn"
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors duration-fast"
            >
              <Pencil className="h-3 w-3" strokeWidth={1.75} />
              Record after call
            </button>
            {line.requestedDate && (
              <RequestEmailButton
                requestedDate={line.requestedDate}
                subtradeName={subtradeName}
                tradeName={tradeName}
              />
            )}
          </span>
        )}
      </div>

      {/* Auto-raise banner when sub has missed their date */}
      {isMissed && (
        <div
          data-testid="trade-date-missed-banner"
          className="flex items-start gap-2 rounded-lg bg-status-blocked/5 border border-status-blocked/20 px-3 py-2"
        >
          <AlertCircle
            className="h-3.5 w-3.5 text-status-blocked shrink-0 mt-0.5"
            strokeWidth={1.75}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-status-blocked font-medium">
              {subtradeName} missed their committed date
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Raise a blocker to track accountability and earn extra buffer on the next job.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoRaiseBanner}
            data-testid="trade-date-raise-blocker-btn"
            className="shrink-0 text-xs font-medium text-status-blocked hover:underline transition-colors duration-fast"
          >
            Raise blocker
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Request via email" button — generates a mailto: draft when no server route
 * is wired yet (S11). The full token flow (POST /api/trades/[id]/request-date)
 * is a follow-on slice. The button is only shown when a requestedDate is set
 * so there's something concrete to ask the sub to confirm or counter.
 */
function RequestEmailButton({
  requestedDate,
  subtradeName,
  tradeName,
}: {
  requestedDate: string;
  subtradeName: string;
  tradeName: string;
}) {
  function openMailto() {
    const subject = encodeURIComponent(`Date confirmation request — ${tradeName}`);
    const body = encodeURIComponent(
      `Hi ${subtradeName},\n\n` +
        `We have you tentatively scheduled for ${requestedDate} for the ${tradeName} work on our job.\n\n` +
        `Please reply to confirm this date or let us know if you need to adjust it.\n\n` +
        `Thanks`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  return (
    <button
      type="button"
      onClick={openMailto}
      data-testid="trade-date-request-email-btn"
      className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors duration-fast"
    >
      <Mail className="h-3 w-3" strokeWidth={1.75} />
      Request via email
    </button>
  );
}
