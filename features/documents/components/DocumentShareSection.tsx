"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, Ban, Eye, AlertTriangle, Mail, Send } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { ProjectDocument, ShareToken } from "@shared/lib/types";
import { useDocumentShareLinks } from "../lib/documentShareLinksStore";
import { selectClientSafeDocuments, countExcludedDriveLinks } from "../lib/documentShare";
import { isValidEmail, NOTIFY_PREF_LABELS, type NotifyPreference } from "../lib/documentSendShareLink";

/**
 * Owner mint / list / revoke / email for no-login document VIEW links (S2+S3,
 * ADR 0022), rendered inside `DocumentsCard` behind
 * `NEXT_PUBLIC_PROJECT_FILES_ENABLED`. A minted link anchors on the first
 * client-safe current doc; the public /d/<token> portal derives the whole
 * curated set from that doc's job.
 *
 * S3 additions: opt-in expiry date, notification preference, and an email
 * send button on each link row with Resend (when configured) and a mailto
 * fallback (when unconfigured). Recipient email prefilled from the job's
 * designer contact. `sent_at` is recorded in state.sentAt via the server route.
 */
export function DocumentShareSection({
  docs,
  designerEmail,
}: {
  docs: ProjectDocument[];
  designerEmail?: string | null;
}) {
  const documentIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const { links, busy, create, revoke } = useDocumentShareLinks(documentIds);
  const [recipient, setRecipient] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notifyPref, setNotifyPref] = useState<NotifyPreference | "">("");

  const safe = useMemo(() => selectClientSafeDocuments(docs), [docs]);
  const driveWarn = useMemo(() => countExcludedDriveLinks(docs), [docs]);
  const anchorId = safe[0]?.id ?? null;

  const activeLinks = links.filter((l) => !l.revokedAt);

  async function handleMint() {
    if (!anchorId) return;
    await create(anchorId, recipient.trim() || null, {
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      notifyPreference: notifyPref || null,
    });
    setRecipient("");
    setExpiresAt("");
    setNotifyPref("");
  }

  return (
    <div
      data-testid="document-share-section"
      className="px-6 py-4 border-b border-[rgba(26,25,22,0.05)] bg-surface-muted/20"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-semibold">
            Share with client (no login)
          </h4>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {safe.length > 0
              ? `${safe.length} current client-safe document${safe.length === 1 ? "" : "s"} will be visible.`
              : "No client-safe documents to share yet — add an uploaded drawing of a shareable kind."}
          </p>
        </div>
      </div>

      {driveWarn > 0 ? (
        <div
          data-testid="document-share-drive-warning"
          className="mt-2 flex items-start gap-1.5 rounded-lg bg-status-blocked-soft/40 px-3 py-2 text-xs text-status-blocked"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span>
            {driveWarn} Google Drive link{driveWarn === 1 ? "" : "s"} won&apos;t appear on the
            shared page — we can&apos;t guarantee no-login access to Drive. Upload the file to
            include it.
          </span>
        </div>
      ) : null}

      {/* Mint form */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient name (optional)"
          aria-label="Recipient name"
          className="flex-1 min-w-[10rem] rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        />
        {/* Opt-in expiry (S3) */}
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          aria-label="Expires on (optional)"
          title="Expires on (optional) — leave blank for never"
          min={new Date().toISOString().slice(0, 10)}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          data-testid="document-share-expires"
        />
        {/* Notification preference (S3) */}
        <select
          value={notifyPref}
          onChange={(e) => setNotifyPref(e.target.value as NotifyPreference | "")}
          aria-label="Notification preference"
          data-testid="document-share-notify-pref"
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <option value="">Notifications (default)</option>
          {(Object.keys(NOTIFY_PREF_LABELS) as NotifyPreference[]).map((p) => (
            <option key={p} value={p}>
              {NOTIFY_PREF_LABELS[p]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleMint}
          disabled={!anchorId || busy}
          data-testid="document-share-mint"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium duration-fast",
            !anchorId || busy
              ? "bg-surface-muted text-text-tertiary cursor-not-allowed"
              : "bg-ink-pill text-white hover:bg-accent-active"
          )}
        >
          <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
          Create share link
        </button>
      </div>

      {activeLinks.length > 0 ? (
        <ul className="mt-3 space-y-1.5" data-testid="document-share-links">
          {activeLinks.map((l) => (
            <ShareLinkRow
              key={l.id}
              link={l}
              designerEmail={designerEmail ?? null}
              onRevoke={() => revoke(l.id)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ShareLinkRow({
  link,
  designerEmail,
  onRevoke,
}: {
  link: ShareToken;
  designerEmail: string | null;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState(designerEmail ?? "");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<string | null>(null);

  const url =
    typeof window !== "undefined" ? `${window.location.origin}/d/${link.token}` : `/d/${link.token}`;

  // Whether this link has already been emailed (sentAt recorded in state).
  const sentAt =
    typeof link.state.sentAt === "string" ? link.state.sentAt : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the link is still visible in the row */
    }
  }

  async function handleSend() {
    if (!isValidEmail(email) || sending) return;
    setSending(true);
    setSendNote(null);
    try {
      const res = await fetch(`/api/documents/share-tokens/${link.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };

      if (res.status === 503 || body.reason === "unconfigured") {
        // Resend not configured — fall back to a mailto draft.
        const subject = encodeURIComponent("Project documents ready for your review");
        const mailBody = encodeURIComponent(
          `Hi${link.recipientName ? ` ${link.recipientName}` : ""},\n\nYour project documents are ready to view:\n${url}\n\nThanks,\nGood Woods`
        );
        window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${mailBody}`);
        setSendNote("Email client opened (Resend not configured).");
      } else if (body.ok) {
        setSendNote(`Sent to ${email}`);
      } else {
        setSendNote(`Send failed: ${body.reason ?? "unknown error"}`);
      }
    } catch {
      setSendNote("Send failed — check your connection.");
    } finally {
      setSending(false);
    }
  }

  return (
    <li
      data-testid="document-share-link-row"
      data-link-id={link.id}
      className="rounded-lg bg-surface px-3 py-2 text-xs"
    >
      {/* Row header: recipient + views + revoke */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-text-primary">
            {link.recipientName ?? "Anyone with the link"}
          </div>
          <div className="flex items-center gap-2 text-text-tertiary">
            <span className="inline-flex items-center gap-1" data-testid="document-share-views">
              <Eye className="h-3 w-3" strokeWidth={1.75} />
              {link.viewCount} view{link.viewCount === 1 ? "" : "s"}
            </span>
            {link.viewedAt ? (
              <span>· last opened {new Date(link.viewedAt).toLocaleDateString("en-CA")}</span>
            ) : (
              <span>· not opened yet</span>
            )}
            {sentAt ? (
              <span data-testid="document-share-sent-at">
                · emailed {new Date(sentAt).toLocaleDateString("en-CA")}
              </span>
            ) : null}
            {link.expiresAt ? (
              <span>
                · expires {new Date(link.expiresAt).toLocaleDateString("en-CA")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            data-testid="document-share-copy"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-text-secondary duration-fast hover:text-text-primary"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRevoke}
            data-testid="document-share-revoke"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-text-tertiary duration-fast hover:text-status-blocked"
          >
            <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
            Revoke
          </button>
        </div>
      </div>

      {/* S3: email send row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Mail className="h-3 w-3 text-text-tertiary shrink-0" strokeWidth={1.75} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            aria-label="Recipient email address"
            data-testid="document-share-email-input"
            className="flex-1 min-w-[10rem] rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!isValidEmail(email) || sending}
          data-testid="document-share-send"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium duration-fast",
            !isValidEmail(email) || sending
              ? "bg-surface-muted text-text-tertiary cursor-not-allowed"
              : "bg-ink-pill text-white hover:bg-accent-active"
          )}
        >
          <Send className="h-3 w-3" strokeWidth={1.75} />
          {sending ? "Sending…" : sentAt ? "Resend" : "Send email"}
        </button>
        {sendNote ? (
          <span data-testid="document-share-send-note" className="text-text-tertiary text-[11px]">
            {sendNote}
          </span>
        ) : null}
      </div>
    </li>
  );
}
