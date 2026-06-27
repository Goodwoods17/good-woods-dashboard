"use client";

import { useState } from "react";
import { Bell, CheckCircle, Clock, Mail, Send, X } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { Job } from "@shared/lib/types";
import type { NotificationPayload, NotificationKind } from "../lib/notifications";
import {
  requiresApproval as kindRequiresApproval,
  HOLD_REASON_LABELS,
  type HoldReason,
} from "../lib/notifications";

/**
 * S22 — Notifications panel for the Schedule tab (issue #110).
 *
 * Shows the outbound notification queue for this job:
 *   – Approval-required drafts (recommit, kickoff, nudge) with a "Send" CTA
 *     that calls /api/scheduling/notifications/send.
 *   – Auto-send logistics reminders with status.
 *   – Message budget advisory (quiet hours, daily cap, debounce).
 *
 * The parent (ScheduleTab / RecommitPanel) composes a notification payload and
 * passes it here for rendering + approval. The panel is additive and renders
 * nothing when there's no pending notification.
 */

const KIND_LABELS: Record<NotificationKind, string> = {
  recommit: "Date update",
  date_change: "Date change",
  client_nudge: "What's next nudge",
  kickoff: "Kickoff message",
  logistics_reminder: "Logistics reminder",
};

type SendStatus = "idle" | "sending" | "sent" | "error" | "unconfigured";

type PendingNotification = NotificationPayload & {
  /** The DB id from scheduling_notifications (set after the draft is persisted). */
  id?: string;
};

export function NotificationsPanel({
  job,
  pending,
  holdReason,
  onDismiss,
}: {
  job: Job;
  /**
   * A composed notification payload awaiting approval / auto-send.
   * When null/undefined, the panel renders nothing (fully additive).
   */
  pending?: PendingNotification | null;
  /** Budget advisory from computeHoldReason. */
  holdReason?: HoldReason;
  /** Called when the owner dismisses / cancels the notification. */
  onDismiss?: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");

  // Nothing to render when no pending notification.
  if (!pending) return null;

  // Capture as a local const so TypeScript can narrow the type in async callbacks.
  const notif = pending;
  const needsApproval = kindRequiresApproval(notif.kind);

  async function handleSend() {
    const email = recipientEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    setSendStatus("sending");

    try {
      // If the notification isn't persisted yet, fall back to a simple mailto.
      if (!notif.id) {
        // Fallback: open mailto draft.
        const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(notif.subject)}&body=${encodeURIComponent(notif.body)}`;
        window.open(mailtoUrl, "_blank");
        setSendStatus("sent");
        return;
      }

      const res = await fetch("/api/scheduling/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notif.id, recipientEmail: email }),
      });

      const data = (await res.json()) as { ok: boolean; reason?: string };
      if (!data.ok) {
        if (data.reason === "unconfigured") {
          setSendStatus("unconfigured");
          // Fall through to mailto draft.
          const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(notif.subject)}&body=${encodeURIComponent(notif.body)}`;
          window.open(mailtoUrl, "_blank");
        } else {
          setSendStatus("error");
        }
        return;
      }

      setSendStatus("sent");
    } catch {
      setSendStatus("error");
    }
  }

  return (
    <section
      data-testid="notifications-panel"
      data-kind={notif.kind}
      className="bg-surface rounded-xl shadow-resting overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3 bg-surface-muted">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-text-primary">
            {needsApproval ? "Notification — approval required" : "Auto-send notification"}
          </h3>
        </div>
        {onDismiss && (
          <button
            type="button"
            data-testid="notifications-dismiss"
            onClick={onDismiss}
            className="rounded-full p-1 text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Kind badge + approval indicator */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="notification-kind-badge"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-surface-muted text-text-secondary"
          >
            <Mail className="h-3 w-3" strokeWidth={1.75} />
            {KIND_LABELS[notif.kind] ?? notif.kind}
          </span>

          {needsApproval ? (
            <span
              data-testid="notification-approval-badge"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-status-at-risk-soft text-status-at-risk"
            >
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              Owner approval required before sending
            </span>
          ) : (
            <span
              data-testid="notification-auto-send-badge"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-status-on-track-soft text-status-on-track"
            >
              Auto-send eligible
            </span>
          )}
        </div>

        {/* Hold reason advisory */}
        {holdReason && (
          <div
            data-testid="notification-hold-reason"
            data-reason={holdReason}
            className="rounded-lg border border-border-faint bg-surface-muted px-4 py-2.5 text-xs text-text-secondary"
          >
            {HOLD_REASON_LABELS[holdReason]}
          </div>
        )}

        {/* Draft preview */}
        <div
          data-testid="notification-draft"
          className="rounded-lg border border-border-faint overflow-hidden"
        >
          <div className="px-4 py-2.5 bg-surface-muted border-b border-border-faint">
            <p className="text-xs text-text-tertiary uppercase tracking-[0.06em]">Subject</p>
            <p
              data-testid="notification-subject"
              className="text-sm font-medium text-text-primary mt-0.5"
            >
              {notif.subject}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-text-tertiary uppercase tracking-[0.06em] mb-1.5">
              Message
            </p>
            <pre
              data-testid="notification-body"
              className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed font-sans"
            >
              {notif.body}
            </pre>
          </div>
        </div>

        {/* Send action (approval-required path) */}
        {needsApproval && sendStatus !== "sent" && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-[0.06em]">
              Send to client
            </label>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  type="email"
                  data-testid="notification-recipient-email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className={cn(
                    "w-full rounded-lg border px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary",
                    "bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft",
                    emailError ? "border-status-blocked" : "border-border"
                  )}
                />
                {emailError && (
                  <p className="mt-1 text-xs text-status-blocked">{emailError}</p>
                )}
              </div>
              <button
                type="button"
                data-testid="notification-send-btn"
                onClick={handleSend}
                disabled={sendStatus === "sending"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium",
                  "bg-ink-pill text-white hover:bg-accent-active transition-colors duration-fast",
                  "focus:outline-none focus:ring-2 focus:ring-accent-soft",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                {sendStatus === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
            {sendStatus === "error" && (
              <p
                data-testid="notification-send-error"
                className="text-xs text-status-blocked"
              >
                Send failed. Check your Resend configuration.
              </p>
            )}
            {sendStatus === "unconfigured" && (
              <p
                data-testid="notification-unconfigured"
                className="text-xs text-text-secondary"
              >
                Email preview opened in a new tab (Resend not configured in this environment).
              </p>
            )}
            <p className="text-xs text-text-tertiary">
              This message requires your approval before it reaches the client. Review the
              draft above, then enter the client&rsquo;s email and click Send.
            </p>
          </div>
        )}

        {/* Auto-send logistics path */}
        {!needsApproval && sendStatus !== "sent" && (
          <div className="text-xs text-text-secondary">
            This logistics reminder will be sent automatically.{" "}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-text-tertiary underline hover:text-text-secondary transition-colors duration-fast"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Sent confirmation */}
        {sendStatus === "sent" && (
          <div
            data-testid="notification-sent-confirmation"
            className="flex items-center gap-2 text-sm text-status-on-track"
          >
            <CheckCircle className="h-4 w-4" strokeWidth={1.75} />
            Message sent to {recipientEmail || "client"}.
          </div>
        )}
      </div>
    </section>
  );
}
