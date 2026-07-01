"use client";

import { BookOpen, Pin, PinOff, Share2 } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { DOCUMENT_KIND_LABELS, CLIENT_SAFE_KINDS, type ProjectDocument } from "@shared/lib/types";
import { useDocuments, useProjectDocuments } from "../lib/documentsStore";
import { selectCurrentSpecDocuments } from "../lib/currentSpec";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";

/**
 * Hero card: the job's canonical current spec — every document where
 * `is_current` is set. Sits at the top of `OverviewTab` (S6, milestone #12).
 *
 * Renders only when there is at least one document for the job (so the card
 * never displaces the "no docs yet" state in DocumentsCard). When `isCurrent`
 * docs exist, it surfaces them with a one-click unpin action. When the
 * PROJECT_FILES flag is on, a sub-line shows how many will appear on the share
 * link — closing the "what does the client see?" question without digging into
 * the Documents card.
 *
 * A11y: each unpin button has an aria-label that names the doc; the card
 * heading uses an appropriate heading level for its position.
 */
export function CurrentSpecCard({ projectId }: { projectId: string }) {
  const docs = useProjectDocuments(projectId);
  const { updateDocument } = useDocuments();

  // Never render when the job has no documents at all — let DocumentsCard own that.
  if (docs.length === 0) return null;

  const current = selectCurrentSpecDocuments(docs);

  // Count of docs that will actually appear on the client share link
  // (is_current + upload + client-safe kind). Only shown when the feature flag
  // is on so staff see the "what the client sees" count without context switches.
  const shareCount = current.filter(
    (d) => d.source !== "link" && CLIENT_SAFE_KINDS.includes(d.kind)
  ).length;

  async function handleUnpin(doc: ProjectDocument) {
    await updateDocument(doc.id, { isCurrent: false });
  }

  return (
    <section
      data-testid="current-spec-card"
      className="bg-surface rounded-xl shadow-resting overflow-hidden"
      aria-label="Current spec"
    >
      <header className="px-6 py-4 flex items-center justify-between gap-3 border-b border-hairline">
        <div className="flex items-start gap-2.5">
          <BookOpen
            className="mt-0.5 h-4 w-4 text-text-tertiary shrink-0"
            strokeWidth={1.5}
            aria-hidden
          />
          <div>
            <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-semibold">
              Current spec
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              {current.length === 0
                ? "No documents pinned yet — mark a document as current in the card below."
                : `${current.length} document${current.length === 1 ? "" : "s"} in the active set.`}
              {projectFilesEnabled() && current.length > 0 && (
                <>
                  {" "}
                  <span
                    className="inline-flex items-center gap-0.5 text-text-tertiary"
                    data-testid="spec-share-count"
                  >
                    <Share2 className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {shareCount} will appear on a share link.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </header>

      {current.length === 0 ? (
        <div className="px-6 py-5 text-sm text-text-tertiary">
          Use the <span className="font-medium text-text-secondary">Documents</span> card below to
          mark drawings or specifications as the current working set.
        </div>
      ) : (
        <ul className="divide-y divide-hairline" aria-label="Pinned documents">
          {current.map((doc) => (
            <li
              key={doc.id}
              data-testid="spec-doc-row"
              data-doc-id={doc.id}
              className="flex items-center justify-between gap-3 px-6 py-3"
            >
              <div className="min-w-0 flex-1 flex items-center gap-2.5">
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center rounded-full px-1.5 py-0",
                    "text-[10px] uppercase tracking-[0.06em] font-medium",
                    "bg-surface-sunken text-text-tertiary"
                  )}
                  aria-label={`Kind: ${DOCUMENT_KIND_LABELS[doc.kind]}`}
                >
                  {DOCUMENT_KIND_LABELS[doc.kind]}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{doc.label}</div>
                  {doc.version && (
                    <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-tertiary">
                      {doc.version}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleUnpin(doc)}
                data-testid="spec-doc-unpin"
                aria-label={`Unpin "${doc.label}" from current spec`}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                  "text-[11px] font-medium text-text-tertiary transition-colors duration-fast",
                  "hover:text-status-blocked hover:bg-status-blocked-soft/30",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                )}
              >
                <PinOff className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Unpin
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Small "Pin" toggle shown on each row of the DocumentsCard list. Clicking it
 * toggles `isCurrent` on the document. Used by DocumentsCard to let staff
 * promote / demote documents in the current spec without leaving the list.
 */
export function PinToggle({ doc }: { doc: ProjectDocument }) {
  const { updateDocument } = useDocuments();

  async function toggle() {
    await updateDocument(doc.id, { isCurrent: !doc.isCurrent });
  }

  return doc.isCurrent ? (
    <button
      type="button"
      onClick={toggle}
      data-testid="doc-pin-toggle"
      data-pinned="true"
      data-doc-id={doc.id}
      aria-label={`Unpin "${doc.label}" from current spec`}
      aria-pressed={true}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-[10px] font-medium transition-colors duration-fast",
        "bg-accent-soft/40 text-accent hover:bg-status-blocked-soft/40 hover:text-status-blocked",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      )}
    >
      <Pin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      Current
    </button>
  ) : (
    <button
      type="button"
      onClick={toggle}
      data-testid="doc-pin-toggle"
      data-pinned="false"
      data-doc-id={doc.id}
      aria-label={`Pin "${doc.label}" as current spec`}
      aria-pressed={false}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-[10px] font-medium transition-colors duration-fast",
        "text-text-tertiary hover:text-text-primary hover:bg-surface-muted/60",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      )}
    >
      <Pin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      Pin
    </button>
  );
}
