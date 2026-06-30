"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  History,
  PencilRuler,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_ORDER,
  type DocumentKind,
  type ProjectDocument,
} from "@shared/lib/types";
import { useDocuments, useProjectDocuments } from "../lib/documentsStore";
import { parseDriveUrl } from "../lib/driveUrl";
import { AddDocumentForm } from "./AddDocumentForm";
import { DocumentShareSection } from "./DocumentShareSection";
import { PinToggle } from "./CurrentSpecCard";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useContact } from "@features/contacts/lib/contactsStore";
import { buildRevisionChain, hasRevisionHistory } from "../lib/documentRevision";
import { DocumentPinsPanel } from "@features/drawings/components/DocumentPinsPanel";
import { DocumentApprovalPanel } from "./DocumentApprovalPanel";

/**
 * Documents card on JobDetail. Tagged shelf with kind-filter chips,
 * list per project, inline preview, add form, delete. Drive-first.
 *
 * Layout: header + chip row · list (left) + preview pane (right on
 * desktop, beneath on mobile).
 *
 * S7 additions: SUPERSEDED badge on non-current rows; Supersedes picker in
 * AddDocumentForm; Revision history panel in the detail pane.
 */

type Filter = "all" | DocumentKind;

export function DocumentsCard({ projectId }: { projectId: string }) {
  const docs = useProjectDocuments(projectId);
  const { createDocument, deleteDocument, supersedeDocument } = useDocuments();
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // S3: prefill the recipient email from the job's designer contact.
  const job = useJob(projectId);
  const designerContact = useContact(job?.designerId ?? "");
  const designerEmail = designerContact?.emails?.[0]?.value?.trim() ?? null;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: docs.length } as Record<Filter, number>;
    for (const k of DOCUMENT_KIND_ORDER) c[k] = 0;
    for (const d of docs) c[d.kind] = (c[d.kind] ?? 0) + 1;
    return c;
  }, [docs]);

  const filtered = useMemo(() => {
    const base = filter === "all" ? docs : docs.filter((d) => d.kind === filter);
    return [...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [docs, filter]);

  const active = activeId ? (docs.find((d) => d.id === activeId) ?? null) : (filtered[0] ?? null);
  const activePreview = active?.driveUrl ? parseDriveUrl(active.driveUrl) : null;

  // S7: revision chain for the currently-selected document.
  const activeRevisionChain = useMemo(
    () => (active ? buildRevisionChain(active, docs) : []),
    [active, docs]
  );
  const activeHasHistory = activeRevisionChain.length > 1;

  async function handleAdd(payload: {
    kind: DocumentKind;
    label: string;
    driveUrl: string;
    version: string | null;
    supersedesId: string | null;
  }) {
    setSavingNew(true);
    try {
      const id = crypto.randomUUID();
      await createDocument({
        id,
        projectId,
        kind: payload.kind,
        label: payload.label,
        driveUrl: payload.driveUrl,
        version: payload.version,
        isCurrent: true,
        notes: null,
        uploadedBy: null,
        createdAt: new Date().toISOString(),
        source: "link",
        supersedesId: null,
      });
      // S7: wire the supersede relationship after the new doc is persisted.
      if (payload.supersedesId) {
        await supersedeDocument(id, payload.supersedesId);
      }
      setActiveId(id);
      setAdding(false);
    } finally {
      setSavingNew(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this document reference? The file in Google Drive is untouched.")) {
      return;
    }
    await deleteDocument(id);
    if (activeId === id) setActiveId(null);
  }

  return (
    <section className="bg-surface rounded-xl shadow-resting overflow-hidden">
      <header className="px-6 py-4 flex items-center justify-between gap-3 border-b border-[rgba(26,25,22,0.05)]">
        <div>
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-semibold">
            Documents
          </h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Drive links and uploaded drawings. Click any row to preview without leaving the page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((p) => !p)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
            adding
              ? "bg-surface-muted text-text-secondary hover:text-text-primary"
              : "bg-ink-pill text-white hover:bg-accent-active"
          )}
        >
          {adding ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
              Close
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add document
            </>
          )}
        </button>
      </header>

      {adding && (
        <div className="px-6 py-4 bg-surface-muted/30 border-b border-[rgba(26,25,22,0.05)]">
          <AddDocumentForm
            onSave={handleAdd}
            busy={savingNew}
            existingDocs={docs}
          />
        </div>
      )}

      {projectFilesEnabled() && docs.length > 0 && (
        <DocumentShareSection docs={docs} designerEmail={designerEmail} />
      )}

      <div className="px-6 py-3 flex flex-wrap items-center gap-1.5 border-b border-[rgba(26,25,22,0.05)]">
        <Chip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={counts.all}
        />
        {DOCUMENT_KIND_ORDER.map((k) =>
          counts[k] > 0 ? (
            <Chip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              label={DOCUMENT_KIND_LABELS[k]}
              count={counts[k]}
            />
          ) : null
        )}
      </div>

      {docs.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
          <ul className="lg:col-span-2 lg:border-r border-[rgba(26,25,22,0.05)] divide-y divide-[rgba(26,25,22,0.05)] max-h-[480px] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-6 py-6 text-sm text-text-tertiary text-center">
                No documents of this type yet.
              </li>
            ) : (
              filtered.map((d) => (
                <li key={d.id} className="flex items-stretch">
                  <button
                    type="button"
                    data-testid="doc-list-row"
                    data-doc-id={d.id}
                    onClick={() => setActiveId(d.id)}
                    className={cn(
                      "flex-1 min-w-0 text-left px-6 py-3 transition-colors duration-fast",
                      active?.id === d.id ? "bg-surface-muted/60" : "hover:bg-surface-muted/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <KindPill kind={d.kind} />
                          {d.version && (
                            <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-tertiary">
                              {d.version}
                            </span>
                          )}
                          {/* S7 — SUPERSEDED badge for non-current documents. */}
                          {!d.isCurrent && (
                            <span
                              data-testid="doc-superseded-badge"
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0",
                                "text-[10px] uppercase tracking-[0.06em] font-medium",
                                "bg-status-blocked-soft/40 text-status-blocked"
                              )}
                            >
                              Superseded
                            </span>
                          )}
                          {/* S7 — revision history indicator. */}
                          {hasRevisionHistory(d, docs) && (
                            <History
                              className="h-3 w-3 text-text-tertiary"
                              strokeWidth={1.75}
                              aria-label="Has revision history"
                            />
                          )}
                        </div>
                        <div className="text-sm font-medium text-text-primary truncate">
                          {d.label}
                        </div>
                        <div className="text-xs text-text-tertiary mt-0.5">
                          {new Date(d.createdAt).toLocaleDateString("en-CA", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      {d.source === "link" ? (
                        <FileText
                          className="h-4 w-4 text-text-tertiary shrink-0 mt-0.5"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <PencilRuler
                          className="h-4 w-4 text-text-tertiary shrink-0 mt-0.5"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                  </button>
                  {/* Pin toggle sits outside the row button to avoid nesting interactive elements. */}
                  <div className="flex items-center pr-3 shrink-0">
                    <PinToggle doc={d} />
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="lg:col-span-3 min-h-[300px] bg-surface-muted/20">
            {active && active.source !== "link" ? (
              <div className="h-full flex flex-col items-center justify-center px-6 py-10 text-center">
                <PencilRuler className="h-5 w-5 mb-2 text-text-tertiary" strokeWidth={1.5} />
                <div className="text-sm font-medium text-text-primary">{active.label}</div>
                <p className="mt-1 mb-3 max-w-xs text-xs text-text-tertiary">
                  Uploaded {DOCUMENT_KIND_LABELS[active.kind].toLowerCase()} drawing. View, zoom,
                  and manage it in the Drawings workspace.
                </p>
                <Link
                  href={`/jobs/${projectId}/drawings`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-3 py-1.5 text-xs font-medium text-white duration-fast hover:bg-accent-active focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  <PencilRuler className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Open in Drawings
                </Link>
                {/* S7 — revision history below the drawing action. */}
                {activeHasHistory && (
                  <RevisionHistoryPanel chain={activeRevisionChain} activeId={active.id} />
                )}
                {/* S9 — cross-link reverse panel: pieces that have a pin on this drawing. */}
                <DocumentPinsPanel documentId={active.id} projectId={projectId} />
                {/* S12 — parallel approval routing (architect + GC + PM). */}
                {projectFilesEnabled() && (
                  <div className="w-full mt-4 -mx-6">
                    <DocumentApprovalPanel
                      documentId={active.id}
                      jobId={projectId}
                      jobName={job?.name}
                    />
                  </div>
                )}
              </div>
            ) : active ? (
              <div className="h-full flex flex-col">
                <div className="px-6 py-3 flex items-center justify-between gap-3 border-b border-[rgba(26,25,22,0.05)]">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {active.label}
                      {active.version && (
                        <span className="text-text-tertiary font-normal ml-2">
                          ({active.version})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary flex items-center gap-1.5">
                      {DOCUMENT_KIND_LABELS[active.kind]}
                      {!active.isCurrent && (
                        <span
                          data-testid="doc-superseded-badge"
                          className="inline-flex items-center rounded-full bg-status-blocked-soft/40 text-status-blocked px-1.5 text-[10px] uppercase tracking-[0.06em] font-medium"
                        >
                          Superseded
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={active.driveUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent transition-colors duration-fast px-2 py-1"
                      title="Open in Google Drive"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(active.id)}
                      className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-status-blocked transition-colors duration-fast px-2 py-1"
                      title="Remove this reference (file stays in Drive)"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                {activePreview?.embedUrl ? (
                  <iframe
                    key={active.id}
                    src={activePreview.embedUrl}
                    title={active.label}
                    className="flex-1 w-full bg-white"
                    style={{ minHeight: 420 }}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-text-tertiary px-6 py-10 text-center">
                    <div>
                      <Eye className="h-5 w-5 mx-auto mb-2 text-text-tertiary" strokeWidth={1.5} />
                      Preview not available for this link type. Open in Drive instead.
                    </div>
                  </div>
                )}
                {/* S7 — revision history panel below the preview. */}
                {activeHasHistory && (
                  <div className="border-t border-[rgba(26,25,22,0.05)]">
                    <RevisionHistoryPanel chain={activeRevisionChain} activeId={active.id} />
                  </div>
                )}
                {/* S12 — parallel approval routing (architect + GC + PM). */}
                {projectFilesEnabled() && (
                  <DocumentApprovalPanel
                    documentId={active.id}
                    jobId={projectId}
                    jobName={job?.name}
                  />
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-text-tertiary px-6 py-10 text-center">
                Pick a document from the list to preview it here.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * S7 — Revision history panel shown below the detail pane when the active
 * document belongs to a multi-revision lineage. Lists all revisions oldest →
 * newest with the current revision highlighted.
 */
function RevisionHistoryPanel({
  chain,
  activeId,
}: {
  chain: ProjectDocument[];
  activeId: string;
}) {
  return (
    <div
      data-testid="doc-revision-history"
      className="px-6 py-4 w-full text-left"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        <span className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary font-semibold">
          Revision history
        </span>
      </div>
      <ol className="space-y-1">
        {chain.map((rev, idx) => (
          <li
            key={rev.id}
            data-testid="doc-revision-item"
            data-doc-id={rev.id}
            data-is-current={rev.isCurrent}
            className={cn(
              "flex items-center gap-2 text-xs rounded-md px-2 py-1",
              rev.id === activeId
                ? "bg-surface-muted/60 font-medium text-text-primary"
                : "text-text-secondary"
            )}
          >
            <span className="tabular-nums text-text-tertiary w-5 text-right shrink-0">
              {idx + 1}.
            </span>
            <span className="flex-1 truncate">
              {rev.version ? `${rev.version} — ` : ""}
              {rev.label}
            </span>
            {rev.isCurrent ? (
              <span className="shrink-0 rounded-full bg-accent-soft/40 text-accent px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] font-medium">
                Current
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-status-blocked-soft/30 text-status-blocked px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] font-medium">
                Superseded
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast",
        active
          ? "bg-ink-pill text-white"
          : "bg-surface-muted text-text-secondary hover:text-text-primary"
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "text-white/70" : "text-text-tertiary")}>
        {count}
      </span>
    </button>
  );
}

function KindPill({ kind }: { kind: DocumentKind }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-sunken text-text-tertiary px-1.5 py-0 text-[10px] uppercase tracking-[0.06em] font-medium">
      {DOCUMENT_KIND_LABELS[kind]}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-6 py-12 text-center">
      <FileText className="h-7 w-7 text-text-tertiary mx-auto mb-3" strokeWidth={1.5} />
      <h4 className="font-serif text-title font-medium text-text-primary mb-1">No documents yet</h4>
      <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed mb-5">
        Paste a Google Drive link for the designer drawings, Toolpath CNC files, shop drawings,
        architect plans, appliance specs, or permits.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Add the first document
      </button>
    </div>
  );
}
