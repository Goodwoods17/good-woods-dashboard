"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Send,
  Undo2,
  RefreshCw,
  RefreshCcw,
  Paperclip,
} from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import {
  attachmentWarning,
  pushHistoryBadge,
  type AttachmentOutcome,
} from "@features/invoices/lib/qboPushOutcome";
import {
  blockGuidance,
  isReconnectReason,
  QBO_RECONNECT_NOTICE,
  QBO_SETTINGS_HREF,
} from "@features/invoices/lib/qboPushNudge";
import type { LatestPushAttempt } from "@features/invoices/lib/qboPushAudit";
import type { TokenHealth } from "@features/invoices/lib/qboTokenHealth";

/**
 * "Send to QuickBooks" panel for a POSTED invoice (QBO S7, issue #153).
 *
 * Renders only when NEXT_PUBLIC_INVOICES_QBO_ENABLED is on (gated by the parent
 * detail view). Flow: GET the push preview → show a pushed/not-pushed BADGE
 * (with a "View in QuickBooks" deep link once sent). When not yet sent, "Send to
 * QuickBooks" reveals the exact Bill preview + reconciliation; the confirm button
 * is disabled while the block-until-mapped gate is shut, with a plain-English
 * reason. Confirming POSTs once (idempotent server-side) and flips the badge.
 *
 * Degrades gracefully: when QBO isn't connected the preview reports
 * not_connected and we show a clear "connect first" state instead of crashing.
 */

type GateBlock =
  | "already_pushed"
  | "not_posted"
  | "vendor_unmapped"
  | "accounts_unmapped"
  | "taxes_unmapped"
  | null;

type Gate = {
  pushable: boolean;
  block: GateBlock;
  unmappedAccounts: string[];
  unmappedTaxes: string[];
  vendorMapped: boolean;
};

type Reconciliation = {
  lineSubtotal: number;
  gst: number;
  pst: number;
  computedTotal: number;
  statedTotal: number | null;
  balanced: boolean;
};

type Bill = {
  VendorRef: { value: string; name?: string } | null;
  Line: { LineNum: number }[];
};

type Preview = {
  ok: true;
  bill: Bill;
  reconciliation: Reconciliation;
  gate: Gate;
  alreadyPushed: boolean;
  billId: string | null;
  deepLink: string | null;
  latestAttempt: LatestPushAttempt | null;
  // QBO-H8 (#191): aging-token nudge so the owner reconnects before a push fails.
  tokenHealth: TokenHealth | null;
};

// QBO-H8: a notice can carry an actionable Settings link (reconnect / open
// mapping panel) instead of being dead plain text.
type Notice = { message: string; settingsLabel?: string } | null;

type Phase =
  | { kind: "loading" }
  | { kind: "not_connected"; latestAttempt: LatestPushAttempt | null }
  | { kind: "error" }
  | { kind: "ready"; data: Preview };

export function QboPushPanel({ invoiceId }: { invoiceId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);
  // QBO-H7 (#190): a Bill can push while its PDF fails to attach. We hold the
  // amber "didn't attach" copy until a re-attach succeeds.
  const [attachNotice, setAttachNotice] = useState<string | null>(null);
  const [reattaching, setReattaching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/push-qbo`, { cache: "no-store" });
      if (res.status === 400 || res.status === 503) {
        // QBO-H7: even when not connected, the body carries the latest attempt
        // so a prior failed push stays visible (distinct from never-sent).
        const body = (await res.json().catch(() => null)) as {
          latestAttempt?: LatestPushAttempt | null;
        } | null;
        setPhase({ kind: "not_connected", latestAttempt: body?.latestAttempt ?? null });
        return;
      }
      if (!res.ok) {
        setPhase({ kind: "error" });
        return;
      }
      const data = (await res.json()) as Preview;
      setPhase({ kind: "ready", data });
    } catch {
      setPhase({ kind: "error" });
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    setSending(true);
    setNotice(null);
    setAttachNotice(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/push-qbo`, { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        status?: string;
        reason?: string;
        message?: string;
        gate?: Gate;
        attachment?: AttachmentOutcome;
      };
      if (body.ok && (body.status === "pushed" || body.status === "already_pushed")) {
        setShowPreview(false);
        // QBO-H7: the Bill sent — but the PDF attach is non-blocking. Read it so
        // the owner never assumes the document is in QuickBooks when it isn't.
        setAttachNotice(attachmentWarning(body.attachment ?? null));
        await load();
      } else if (body.status === "blocked") {
        // QBO-H8: a block-until-mapped reason is now an actionable link.
        if (body.gate) {
          const g = blockGuidance(body.gate);
          setNotice({
            message: g.message || "This invoice can't be sent yet.",
            settingsLabel: g.linkToSettings ? "Open QuickBooks settings" : undefined,
          });
        } else {
          setNotice({ message: "This invoice can't be sent yet." });
        }
        await load();
      } else if (isReconnectReason(body.reason)) {
        // QBO-H8: an aged/expired token surfaces as not_connected at send time —
        // tell the owner to reconnect instead of a generic "couldn't reach".
        setNotice({ message: QBO_RECONNECT_NOTICE, settingsLabel: "Reconnect QuickBooks" });
      } else {
        setNotice({ message: body.message ?? "Couldn't reach QuickBooks. Try again." });
      }
    } catch {
      setNotice({ message: "Couldn't reach QuickBooks. Try again." });
    } finally {
      setSending(false);
    }
  }, [invoiceId, load]);

  // QBO-H7: retry JUST the PDF attachment against the existing Bill (re-pushing
  // would short-circuit and never re-attach).
  const reattach = useCallback(async () => {
    setReattaching(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/attach-qbo`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; attachment?: AttachmentOutcome };
      if (body.ok && body.attachment?.status === "attached") {
        setAttachNotice(null);
      } else {
        setAttachNotice(
          attachmentWarning(body.attachment ?? null) ??
            "Bill sent, but the PDF still didn’t attach. Try again."
        );
      }
    } catch {
      setAttachNotice("Couldn’t reach QuickBooks to attach the PDF. Try again.");
    } finally {
      setReattaching(false);
    }
  }, [invoiceId]);

  // S10: un-push / void a Bill pushed in error. Confirm-gated (two-step), then
  // POSTs the void; on success the link is cleared server-side so reloading the
  // preview re-opens the "Send to QuickBooks" flow (re-push permitted).
  const voidBill = useCallback(async () => {
    setVoiding(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/void-qbo`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; status?: string; message?: string };
      if (body.ok && body.status === "voided") {
        setConfirmVoid(false);
        setShowPreview(false);
        await load();
      } else if (body.status === "not_pushed") {
        setNotice({ message: "This invoice isn't in QuickBooks anymore." });
        await load();
      } else {
        setNotice({ message: body.message ?? "Couldn't void in QuickBooks. Try again." });
      }
    } catch {
      setNotice({ message: "Couldn't void in QuickBooks. Try again." });
    } finally {
      setVoiding(false);
    }
  }, [invoiceId, load]);

  return (
    <section
      data-testid="qbo-push-panel"
      className="rounded-lg border border-border bg-surface p-5 shadow-resting"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">QuickBooks</h2>

      {phase.kind === "loading" && <p className="text-sm text-text-tertiary">Checking…</p>}

      {phase.kind === "error" && (
        <p className="text-sm text-text-tertiary">Couldn&rsquo;t load the QuickBooks status.</p>
      )}

      {phase.kind === "not_connected" && (
        <div className="space-y-3">
          {/* QBO-H7: a prior failed push stays visible even while disconnected. */}
          <PushHistoryCard
            badge={pushHistoryBadge({ alreadyPushed: false, latest: phase.latestAttempt })}
            onRetryNow={send}
            retrying={sending}
          />
          <p data-testid="qbo-push-not-connected" className="text-sm text-text-secondary">
            <Link
              href={QBO_SETTINGS_HREF}
              data-testid="qbo-push-reconnect-link"
              className="font-medium text-text-primary underline hover:opacity-80"
            >
              Reconnect QuickBooks in Settings
            </Link>{" "}
            to send this bill.
          </p>
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="space-y-4">
          {/* QBO-H8: aging-token reconnect nudge — shown BEFORE a push can fail
              on an expired token, mirroring the bulk-push panel's banner. */}
          {phase.data.tokenHealth && phase.data.tokenHealth.level !== "ok" && (
            <ReconnectBanner health={phase.data.tokenHealth} />
          )}

          {/* Status badge */}
          {phase.data.alreadyPushed && phase.data.billId ? (
            <div
              data-testid="qbo-push-badge-sent"
              className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Sent to QuickBooks — Bill{" "}
                <span data-testid="qbo-bill-number" className="font-mono">
                  #{phase.data.billId}
                </span>
              </span>
              {phase.data.deepLink && (
                <a
                  data-testid="qbo-push-deeplink"
                  href={phase.data.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-emerald-800 underline hover:text-emerald-900"
                >
                  View in QuickBooks <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : null}

          {/* S10: un-push / void — only offered once a Bill exists. */}
          {phase.data.alreadyPushed && phase.data.billId && (
            <div className="space-y-2" data-testid="qbo-void">
              {!confirmVoid ? (
                <button
                  type="button"
                  data-testid="qbo-void-btn"
                  onClick={() => setConfirmVoid(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  <Undo2 className="h-4 w-4" /> Pushed by mistake? Void in QuickBooks
                </button>
              ) : (
                <div
                  data-testid="qbo-void-confirm"
                  className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> This deletes the Bill in QuickBooks and
                    lets you re-send a corrected invoice. It can&rsquo;t be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="qbo-void-confirm-btn"
                      onClick={voidBill}
                      disabled={voiding}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Undo2 className="h-4 w-4" /> {voiding ? "Voiding…" : "Void the bill"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmVoid(false)}
                      className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QBO-H7: amber "Bill sent but PDF didn't attach" — with a re-attach retry. */}
          {phase.data.alreadyPushed && attachNotice && (
            <AttachmentMissingBanner
              message={attachNotice}
              onRetry={reattach}
              retrying={reattaching}
            />
          )}

          {/* Not-sent / failed-history badge. QBO-H7 makes a failed/retry-pending
              push distinct from a never-attempted one. */}
          {!phase.data.alreadyPushed &&
            (pushHistoryBadge({ alreadyPushed: false, latest: phase.data.latestAttempt }).kind ===
            "none" ? (
              <div
                data-testid="qbo-push-badge-unsent"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary"
              >
                Not sent to QuickBooks
              </div>
            ) : (
              <PushHistoryCard
                badge={pushHistoryBadge({ alreadyPushed: false, latest: phase.data.latestAttempt })}
                onRetryNow={send}
                retrying={sending}
              />
            ))}

          {/* Send flow (only when not already sent) */}
          {!phase.data.alreadyPushed && (
            <div className="space-y-3">
              {!showPreview ? (
                <button
                  type="button"
                  data-testid="qbo-send-btn"
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-ink-pill px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  <Send className="h-4 w-4" /> Send to QuickBooks
                </button>
              ) : (
                <div
                  data-testid="qbo-push-preview"
                  className="space-y-3 rounded-md border border-border bg-surface-muted p-4"
                >
                  <p className="text-sm font-medium text-text-primary">Review the bill</p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                    <Stat label="Vendor" value={phase.data.bill.VendorRef?.name ?? "—"} />
                    <Stat label="Lines" value={String(phase.data.bill.Line.length)} />
                    <Stat label="GST" value={formatCAD(phase.data.reconciliation.gst)} />
                    <Stat label="PST" value={formatCAD(phase.data.reconciliation.pst)} />
                    <Stat
                      label="Bill total"
                      value={formatCAD(phase.data.reconciliation.computedTotal)}
                    />
                  </dl>

                  {!phase.data.reconciliation.balanced && (
                    <p className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Bill total doesn&rsquo;t reconcile
                      to the invoice — re-check the lines before sending.
                    </p>
                  )}

                  {!phase.data.gate.pushable && <BlockMessage gate={phase.data.gate} />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="qbo-push-confirm-btn"
                      onClick={send}
                      disabled={!phase.data.gate.pushable || sending}
                      className="inline-flex items-center gap-1.5 rounded-md bg-ink-pill px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" /> {sending ? "Sending…" : "Confirm & send"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {notice && (
            <div
              data-testid="qbo-push-notice"
              className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
            >
              <p>{notice.message}</p>
              {notice.settingsLabel && (
                <Link
                  href={QBO_SETTINGS_HREF}
                  data-testid="qbo-push-notice-link"
                  className="inline-flex items-center gap-1.5 font-medium text-amber-800 underline hover:text-amber-900"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> {notice.settingsLabel}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * QBO-H7: a failed / retry-pending push, visually distinct from "Not sent".
 * A transient failure offers a "Retry now" button (re-POSTs the push); a
 * permanent failure shows the reason without a retry (it would loop forever).
 */
function PushHistoryCard({
  badge,
  onRetryNow,
  retrying,
}: {
  badge: ReturnType<typeof pushHistoryBadge>;
  onRetryNow: () => void;
  retrying: boolean;
}) {
  if (badge.kind === "none") return null;

  if (badge.kind === "queued") {
    return (
      <div
        data-testid="qbo-push-queued"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary"
      >
        <RefreshCw className="h-4 w-4 animate-spin" /> {badge.label}
      </div>
    );
  }

  const testid = badge.kind === "failed_retry" ? "qbo-push-failed-retry" : "qbo-push-failed";
  return (
    <div
      data-testid={testid}
      className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-4 w-4" />{" "}
        <span data-testid="qbo-push-failed-label">{badge.label}</span>
      </p>
      <p className="text-xs text-amber-700">{badge.detail}</p>
      {badge.kind === "failed_retry" && (
        <button
          type="button"
          data-testid="qbo-push-retry-now"
          onClick={onRetryNow}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> {retrying ? "Retrying…" : "Retry now"}
        </button>
      )}
    </div>
  );
}

/**
 * QBO-H7: the Bill is in QuickBooks but its source PDF did not attach. Offers a
 * "Retry attachment" that re-runs only the Attachable upload (re-pushing the
 * Bill would no-op via the local link and never re-attach).
 */
function AttachmentMissingBanner({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      data-testid="qbo-attachment-failed"
      className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <Paperclip className="h-4 w-4" /> {message}
      </p>
      <button
        type="button"
        data-testid="qbo-attachment-retry"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className="h-4 w-4" /> {retrying ? "Attaching…" : "Retry attachment"}
      </button>
    </div>
  );
}

/**
 * QBO-H8: the block-until-mapped reason, with an actionable link to the mapping
 * panel for the reasons that are fixed there (unmapped vendor / account / tax).
 */
function BlockMessage({ gate }: { gate: Gate }) {
  const { message, linkToSettings } = blockGuidance(gate);
  return (
    <div
      data-testid="qbo-push-blocked"
      className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
    >
      <p className="flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4" /> {message}
      </p>
      {linkToSettings && (
        <Link
          href={QBO_SETTINGS_HREF}
          data-testid="qbo-push-blocked-link"
          className="inline-flex items-center gap-1.5 font-medium text-amber-800 underline hover:text-amber-900"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open QuickBooks settings
        </Link>
      )}
    </div>
  );
}

/**
 * QBO-H8: aging-token reconnect nudge on the push panel — visible before a push
 * fails on an expired token. Mirrors QboBulkPushPanel's banner.
 */
function ReconnectBanner({ health }: { health: TokenHealth }) {
  const critical = health.level === "critical";
  return (
    <div
      data-testid="qbo-push-token-health-banner"
      className={`flex flex-wrap items-start gap-3 rounded-md border px-3 py-2 text-sm ${
        critical
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">
          {critical ? "QuickBooks connection needs renewal" : "QuickBooks connection is aging"}
        </p>
        <p>{health.message}</p>
      </div>
      <Link
        href={QBO_SETTINGS_HREF}
        data-testid="qbo-push-reconnect-link"
        className="inline-flex items-center gap-1.5 rounded-md border border-current px-3 py-1 text-xs font-medium hover:opacity-80"
      >
        <RefreshCcw className="h-3 w-3" /> Reconnect QuickBooks
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-text-primary">{value}</dd>
    </div>
  );
}
