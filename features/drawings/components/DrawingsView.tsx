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
  // Two-step delete: first tap arms (armedId), second tap confirms. Matches the
  // app's delete-with-confirm pattern and works on touch (no hover affordance).
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;

  function select(id: string) {
    setArmedId(null);
    setActiveId(id);
  }

  async function onTrash(doc: ProjectDocument) {
    if (busyId) return;
    if (armedId !== doc.id) {
      setArmedId(doc.id); // arm
      return;
    }
    setBusyId(doc.id);
    try {
      if (doc.source === "upload" && doc.storagePath) {
        await removeDrawing(doc.storagePath);
      }
      await deleteDocument(doc.id);
      if (activeId === doc.id) setActiveId(null);
    } finally {
      setBusyId(null);
      setArmedId(null);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-6 py-3">
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
            docs.map((d) => {
              const armed = armedId === d.id;
              return (
              <div key={d.id}
                className={cn(
                  "flex items-center gap-1 rounded-md duration-fast",
                  active?.id === d.id ? "bg-surface-muted" : "hover:bg-surface-muted"
                )}>
                <button onClick={() => select(d.id)}
                  className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center px-2.5 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md">
                  <span className={cn("block truncate",
                    active?.id === d.id ? "text-text-primary" : "text-text-secondary")}>
                    {d.label}
                  </span>
                  <span className="text-micro uppercase tracking-wider text-text-tertiary">
                    {DOCUMENT_KIND_LABELS[d.kind]}{d.source === "link" ? " · link" : ""}
                  </span>
                </button>
                <button onClick={() => onTrash(d)} disabled={busyId === d.id}
                  className={cn(
                    "flex h-11 w-9 shrink-0 items-center justify-center rounded-md duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40",
                    armed
                      ? "bg-status-blocked text-white"
                      : "text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
                  )}
                  aria-label={armed ? `Confirm delete ${d.label}` : `Delete ${d.label}`}
                  title={armed ? "Tap again to delete" : "Delete drawing"}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              );
            })
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
