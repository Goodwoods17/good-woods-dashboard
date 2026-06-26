"use client";

import { useState, useCallback } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Lock,
  Mail,
  QrCode,
  Unlock,
  UserPlus,
  X,
} from "lucide-react";
import type {
  FormInstance,
  FormInstanceField,
  FormShareLink,
  RecipientType,
} from "@shared/lib/types";
import { useFormInstances } from "../lib/formInstancesStore";
import { shareLinkStatus, shareLinkStatusLabel } from "../lib/shareLinkStatus";
import { shareLinkTracking } from "../lib/shareLinkTracking";

// Owner-only date formatter for the recipient-tracking lines (sent / opened).
// Short + with the time, so "Jun 23, 2026, 9:41 AM" reads at a glance.
function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Inline QR code generation — uses the qrcode package to render a data-URL PNG
// rather than shipping SVG ourselves. Lazy-loaded so it never hits the server
// bundle (this component is already "use client").
async function buildQrDataUrl(text: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(text, {
    width: 200,
    margin: 1,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
}

const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  designer: "Designer",
  customer: "Customer",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "text-text-tertiary",
  sent: "text-accent",
  opened: "text-status-on-track",
  started: "text-status-at-risk",
  submitted: "text-status-complete",
  revoked: "text-status-blocked",
};

/** One minted share link row: shows status, copy/mail/QR/revoke actions. */
function ShareLinkRow({
  link,
  instanceFields,
  onRevoke,
  onStampSent,
  onUpdateLocks,
}: {
  link: FormShareLink;
  instanceFields: FormInstanceField[];
  onRevoke: () => void;
  onStampSent: () => void;
  onUpdateLocks: (ids: string[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showLocks, setShowLocks] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const status = shareLinkStatus(link);
  const tracking = shareLinkTracking(link);
  const isRevoked = status === "revoked";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/f/${link.token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
    onStampSent();
  }

  function handleMailDraft() {
    const subject = encodeURIComponent(`Form: ${link.recipientName ?? "Client"} — please fill out`);
    const body = encodeURIComponent(
      `Hi${link.recipientName ? ` ${link.recipientName}` : ""},\n\nPlease fill out the form at the link below:\n${shareUrl}\n\nThanks`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    onStampSent();
  }

  function handleSmsDraft() {
    const body = encodeURIComponent(`Please fill out your form: ${shareUrl}`);
    window.open(`sms:?body=${body}`, "_self");
    onStampSent();
  }

  async function handleQr() {
    if (!qrUrl) {
      const url = await buildQrDataUrl(shareUrl);
      setQrUrl(url);
    }
    setShowQr((v) => !v);
    onStampSent();
  }

  async function handleRevoke() {
    if (!confirm("Revoke this link? The recipient will no longer be able to open it.")) return;
    setRevoking(true);
    try {
      await onRevoke();
    } finally {
      setRevoking(false);
    }
  }

  function toggleLock(fieldId: string) {
    const current = new Set(link.lockedFieldIds);
    if (current.has(fieldId)) {
      current.delete(fieldId);
    } else {
      current.add(fieldId);
    }
    onUpdateLocks(Array.from(current));
  }

  function toggleSectionLock(sectionId: string) {
    // Find all fields between this section and the next section (or end of list).
    const sectionIdx = instanceFields.findIndex((f) => f.id === sectionId);
    const nextSectionIdx = instanceFields.findIndex(
      (f, i) => i > sectionIdx && f.type === "section"
    );
    const childIds = instanceFields
      .slice(sectionIdx + 1, nextSectionIdx === -1 ? undefined : nextSectionIdx)
      .filter((f) => f.type !== "section")
      .map((f) => f.id);

    const current = new Set(link.lockedFieldIds);
    const allLocked = [sectionId, ...childIds].every((id) => current.has(id));
    if (allLocked) {
      // Unlock section + children.
      [sectionId, ...childIds].forEach((id) => current.delete(id));
    } else {
      // Lock section + children.
      [sectionId, ...childIds].forEach((id) => current.add(id));
    }
    onUpdateLocks(Array.from(current));
  }

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-3 ${isRevoked ? "opacity-60" : ""}`}
      data-testid="share-link-row"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {link.recipientName || "Unnamed recipient"}
            </span>
            <span className="text-xs text-text-tertiary">
              {RECIPIENT_TYPE_LABELS[link.recipientType]}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`text-xs font-medium ${STATUS_COLORS[status] ?? "text-text-tertiary"}`}
              data-testid="share-link-status"
            >
              {shareLinkStatusLabel(status)}
            </span>
            {tracking.progress !== null && status !== "submitted" && (
              <span className="text-[10px] text-text-tertiary">· {tracking.progress}%</span>
            )}
          </div>

          {/* Owner-only recipient tracking: sent date + "N days ago" + opened date
              (Andrew's explicit ask). Never rendered on the public /f page. */}
          {(tracking.sentAt || tracking.viewedAt) && (
            <dl
              className="mt-1.5 space-y-0.5 text-[11px] text-text-tertiary"
              data-testid="share-link-tracking"
            >
              {tracking.sentAt && (
                <div className="flex items-baseline gap-1">
                  <dt className="text-text-disabled">Sent</dt>
                  <dd data-testid="tracking-sent">
                    {fmtStamp(tracking.sentAt)}
                    {tracking.daysSinceSent && (
                      <span className="text-text-disabled"> · {tracking.daysSinceSent}</span>
                    )}
                  </dd>
                </div>
              )}
              {tracking.viewedAt && (
                <div className="flex items-baseline gap-1">
                  <dt className="text-text-disabled">Opened</dt>
                  <dd data-testid="tracking-opened">{fmtStamp(tracking.viewedAt)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {!isRevoked && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy link"
              data-testid="copy-share-link"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-muted hover:text-text-primary"
              title="Copy link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-status-on-track" strokeWidth={2.5} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={handleMailDraft}
              aria-label="Open email draft"
              data-testid="mail-share-link"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-muted hover:text-text-primary"
              title="Open email draft"
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={handleQr}
              aria-label="Show QR code"
              data-testid="qr-share-link"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-muted hover:text-text-primary"
              title="Show QR code"
            >
              <QrCode className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setShowLocks((v) => !v)}
              aria-label="Field locks"
              data-testid="toggle-locks"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-muted hover:text-text-primary"
              title="Manage field locks"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={2} />
              {showLocks ? (
                <ChevronUp className="inline h-3 w-3" strokeWidth={2} />
              ) : (
                <ChevronDown className="inline h-3 w-3" strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoking}
              aria-label="Revoke link"
              data-testid="revoke-share-link"
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-muted hover:text-status-blocked disabled:opacity-50"
              title="Revoke link"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* QR code panel */}
      {showQr && qrUrl && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg bg-surface-muted p-3">
          <p className="text-xs text-text-tertiary">Scan to open the form</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR code for share link"
            width={160}
            height={160}
            className="rounded"
            data-testid="share-qr-code"
          />
        </div>
      )}

      {/* Field lock toggles */}
      {showLocks && !isRevoked && (
        <div className="mt-3 space-y-1 rounded-lg bg-surface-muted p-2" data-testid="lock-panel">
          <p className="mb-1.5 text-xs font-medium text-text-secondary">
            Lock fields (read-only for recipient)
          </p>
          {instanceFields.length === 0 ? (
            <p className="text-xs text-text-tertiary">No fields.</p>
          ) : (
            instanceFields.map((field) => {
              const isSection = field.type === "section";
              const locked = link.lockedFieldIds.includes(field.id);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => (isSection ? toggleSectionLock(field.id) : toggleLock(field.id))}
                  aria-label={`${locked ? "Unlock" : "Lock"} ${field.label}`}
                  data-testid={`lock-toggle-${field.id}`}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface ${isSection ? "font-medium text-text-secondary" : "pl-4 text-text-primary"}`}
                >
                  {locked ? (
                    <Lock className="h-3 w-3 shrink-0 text-status-at-risk" strokeWidth={2} />
                  ) : (
                    <Unlock className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={2} />
                  )}
                  <span className="truncate">{field.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* SMS draft link */}
      {!isRevoked && (
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            aria-label="Share URL"
            data-testid={`share-url-${link.id}`}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-text-secondary focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSmsDraft}
            aria-label="Open SMS draft"
            data-testid="sms-share-link"
            className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-tertiary transition-colors hover:text-text-primary"
            title="Open SMS draft"
          >
            SMS
          </button>
        </div>
      )}
    </div>
  );
}

/** Form for adding a new recipient (name + type). */
function AddRecipientForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, type: RecipientType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<RecipientType>("customer");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(name.trim(), type);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3"
      data-testid="add-recipient-form"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipient name"
          aria-label="Recipient name"
          data-testid="recipient-name-input"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RecipientType)}
          aria-label="Recipient type"
          data-testid="recipient-type-select"
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          {(Object.keys(RECIPIENT_TYPE_LABELS) as RecipientType[]).map((t) => (
            <option key={t} value={t}>
              {RECIPIENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          data-testid="add-recipient-submit"
          className="rounded bg-ink-pill px-3 py-1 text-xs font-medium text-white transition-opacity disabled:opacity-50"
        >
          Add recipient
        </button>
      </div>
    </form>
  );
}

/**
 * Full owner-facing share panel for a form instance (Forms P2 · Slice 2).
 * Replaces the bare `ShareFormButton` with multi-recipient management,
 * per-field lock controls, copy/mailto/SMS/QR actions, and revoke.
 */
export function SharePanel({ instance }: { instance: FormInstance }) {
  const {
    shareLinksForInstance,
    fieldsForInstance,
    createShareLink,
    revokeShareLink,
    stampShareLinkSent,
    updateShareLinkLocks,
  } = useFormInstances();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const links = shareLinksForInstance(instance.id);
  const instanceFields = fieldsForInstance(instance.id);

  const handleAdd = useCallback(
    async (name: string, type: RecipientType) => {
      setBusy(true);
      try {
        await createShareLink({
          instanceId: instance.id,
          recipientName: name || null,
          recipientType: type,
        });
        setAdding(false);
      } catch {
        /* error surfaces via the store */
      } finally {
        setBusy(false);
      }
    },
    [createShareLink, instance.id]
  );

  const handleRevoke = useCallback(
    async (linkId: string) => {
      await revokeShareLink(linkId);
    },
    [revokeShareLink]
  );

  const handleStampSent = useCallback(
    async (linkId: string) => {
      await stampShareLinkSent(linkId);
    },
    [stampShareLinkSent]
  );

  const handleUpdateLocks = useCallback(
    async (linkId: string, ids: string[]) => {
      await updateShareLinkLocks(linkId, ids);
    },
    [updateShareLinkLocks]
  );

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="open-share-panel"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
        Share with client
        {links.length > 0 && (
          <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            {links.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2" data-testid="share-panel">
          {links.length === 0 && !adding && (
            <p className="text-xs text-text-tertiary">
              No links yet — add a recipient to get started.
            </p>
          )}

          {links.map((link) => (
            <ShareLinkRow
              key={link.id}
              link={link}
              instanceFields={instanceFields}
              onRevoke={() => handleRevoke(link.id)}
              onStampSent={() => handleStampSent(link.id)}
              onUpdateLocks={(ids) => handleUpdateLocks(link.id, ids)}
            />
          ))}

          {adding ? (
            <AddRecipientForm onAdd={handleAdd} onCancel={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={busy}
              data-testid="add-recipient-button"
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
              Add recipient
            </button>
          )}
        </div>
      )}
    </div>
  );
}
