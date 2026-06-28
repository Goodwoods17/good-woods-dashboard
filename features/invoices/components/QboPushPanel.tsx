"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, ExternalLink, Send, Undo2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";

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
};

type Phase =
  | { kind: "loading" }
  | { kind: "not_connected" }
  | { kind: "error" }
  | { kind: "ready"; data: Preview };

function blockMessage(gate: Gate): string {
  switch (gate.block) {
    case "already_pushed":
      return "Already sent to QuickBooks.";
    case "not_posted":
      return "Post this invoice to actuals before sending it to QuickBooks.";
    case "vendor_unmapped":
      return "Map this supplier to a QuickBooks vendor first (Settings → QuickBooks).";
    case "accounts_unmapped":
      return `Map ${gate.unmappedAccounts.length} expense account${
        gate.unmappedAccounts.length === 1 ? "" : "s"
      } in Settings → QuickBooks first.`;
    case "taxes_unmapped":
      return `Map the ${gate.unmappedTaxes.join(", ")} tax code${
        gate.unmappedTaxes.length === 1 ? "" : "s"
      } in Settings → QuickBooks first.`;
    default:
      return "";
  }
}

export function QboPushPanel({ invoiceId }: { invoiceId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/push-qbo`, { cache: "no-store" });
      if (res.status === 400 || res.status === 503) {
        setPhase({ kind: "not_connected" });
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
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/push-qbo`, { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        status?: string;
        message?: string;
        gate?: Gate;
      };
      if (body.ok && (body.status === "pushed" || body.status === "already_pushed")) {
        setShowPreview(false);
        await load();
      } else if (body.status === "blocked") {
        setNotice(body.gate ? blockMessage(body.gate) : "This invoice can't be sent yet.");
        await load();
      } else {
        setNotice(body.message ?? "Couldn't reach QuickBooks. Try again.");
      }
    } catch {
      setNotice("Couldn't reach QuickBooks. Try again.");
    } finally {
      setSending(false);
    }
  }, [invoiceId, load]);

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
        setNotice("This invoice isn't in QuickBooks anymore.");
        await load();
      } else {
        setNotice(body.message ?? "Couldn't void in QuickBooks. Try again.");
      }
    } catch {
      setNotice("Couldn't void in QuickBooks. Try again.");
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
        <p data-testid="qbo-push-not-connected" className="text-sm text-text-secondary">
          Connect QuickBooks in Settings to send this bill.
        </p>
      )}

      {phase.kind === "ready" && (
        <div className="space-y-4">
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

          {!phase.data.alreadyPushed && (
            <div
              data-testid="qbo-push-badge-unsent"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-secondary"
            >
              Not sent to QuickBooks
            </div>
          )}

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

                  {!phase.data.gate.pushable && (
                    <p
                      data-testid="qbo-push-blocked"
                      className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
                    >
                      <AlertTriangle className="h-4 w-4" /> {blockMessage(phase.data.gate)}
                    </p>
                  )}

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
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {notice}
            </p>
          )}
        </div>
      )}
    </section>
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
