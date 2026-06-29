"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, Ban, Eye, AlertTriangle } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { ProjectDocument } from "@shared/lib/types";
import { useDocumentShareLinks } from "../lib/documentShareLinksStore";
import { selectClientSafeDocuments, countExcludedDriveLinks } from "../lib/documentShare";

/**
 * Owner mint / list / revoke for no-login document VIEW links (S2, ADR 0022),
 * rendered inside `DocumentsCard` behind `NEXT_PUBLIC_PROJECT_FILES_ENABLED`. A
 * minted link anchors on the first client-safe current doc; the public /d/<token>
 * portal derives the whole curated set from that doc's job. Drive-link docs are
 * warned here (they can't guarantee no-login access, so they're held back).
 */
export function DocumentShareSection({ docs }: { docs: ProjectDocument[] }) {
  const documentIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const { links, busy, create, revoke } = useDocumentShareLinks(documentIds);
  const [recipient, setRecipient] = useState("");

  const safe = useMemo(() => selectClientSafeDocuments(docs), [docs]);
  const driveWarn = useMemo(() => countExcludedDriveLinks(docs), [docs]);
  const anchorId = safe[0]?.id ?? null;

  const activeLinks = links.filter((l) => !l.revokedAt);

  async function handleMint() {
    if (!anchorId) return;
    await create(anchorId, recipient.trim() || null);
    setRecipient("");
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
            {driveWarn} Google Drive link{driveWarn === 1 ? "" : "s"} won’t appear on the shared
            page — we can’t guarantee no-login access to Drive. Upload the file to include it.
          </span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient name (optional)"
          aria-label="Recipient name"
          className="flex-1 min-w-[10rem] rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        />
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
              id={l.id}
              token={l.token}
              recipientName={l.recipientName}
              viewCount={l.viewCount}
              viewedAt={l.viewedAt}
              onRevoke={() => revoke(l.id)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ShareLinkRow({
  id,
  token,
  recipientName,
  viewCount,
  viewedAt,
  onRevoke,
}: {
  id: string;
  token: string;
  recipientName: string | null;
  viewCount: number;
  viewedAt: string | null;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/d/${token}` : `/d/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the link is still visible in the row */
    }
  }

  return (
    <li
      data-testid="document-share-link-row"
      data-link-id={id}
      className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-text-primary">
          {recipientName ?? "Anyone with the link"}
        </div>
        <div className="flex items-center gap-2 text-text-tertiary">
          <span className="inline-flex items-center gap-1" data-testid="document-share-views">
            <Eye className="h-3 w-3" strokeWidth={1.75} />
            {viewCount} view{viewCount === 1 ? "" : "s"}
          </span>
          {viewedAt ? (
            <span>· last opened {new Date(viewedAt).toLocaleDateString("en-CA")}</span>
          ) : (
            <span>· not opened yet</span>
          )}
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
    </li>
  );
}
