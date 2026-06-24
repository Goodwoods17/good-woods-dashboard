"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useProjectDocuments, useDocuments } from "@features/documents/lib/documentsStore";
import { DOCUMENT_KIND_LABELS, type ProjectDocument } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DrawingUpload } from "./DrawingUpload";
import { DrawingDoc } from "./DrawingDoc";
import { removeDrawing } from "../lib/storage";

export function DrawingsView({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const docs = useProjectDocuments(jobId);
  const { deleteDocument } = useDocuments();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;

  async function handleDelete(doc: ProjectDocument) {
    if (pendingDelete) return;
    setPendingDelete(doc.id);
    try {
      if (doc.source === "upload" && doc.storagePath) {
        await removeDrawing(doc.storagePath);
      }
      await deleteDocument(doc.id);
      if (activeId === doc.id) setActiveId(null);
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary duration-fast">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="truncate font-serif text-title text-text-primary">
            {job ? `${job.name} — Drawings` : "Drawings"}
          </h1>
        </div>
        <DrawingUpload jobId={jobId} />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-border bg-surface p-2">
          {docs.length === 0 ? (
            <p className="p-2 text-xs text-text-tertiary">No drawings yet. Upload a PDF or image.</p>
          ) : (
            docs.map((d) => (
              <div key={d.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md duration-fast",
                  active?.id === d.id ? "bg-surface-muted" : "hover:bg-surface-muted"
                )}>
                <button onClick={() => setActiveId(d.id)}
                  className="min-w-0 flex-1 px-2.5 py-2 text-left text-sm">
                  <span className={cn("block truncate",
                    active?.id === d.id ? "text-text-primary" : "text-text-secondary")}>
                    {d.label}
                  </span>
                  <span className="text-micro uppercase tracking-wider text-text-tertiary">
                    {DOCUMENT_KIND_LABELS[d.kind]}{d.source === "link" ? " · link" : ""}
                  </span>
                </button>
                <button onClick={() => handleDelete(d)} disabled={pendingDelete === d.id}
                  className="mr-1 shrink-0 rounded-md p-1.5 text-text-tertiary opacity-0 duration-fast hover:bg-status-blocked-soft hover:text-status-blocked focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                  aria-label={`Delete ${d.label}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-4">
          {active ? <DrawingDoc doc={active} /> : (
            <p className="text-sm text-text-tertiary">Select or upload a drawing.</p>
          )}
        </main>
      </div>
    </div>
  );
}
