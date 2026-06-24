"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, MapPin, ListChecks } from "lucide-react";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useProjectDocuments, useDocuments } from "@features/documents/lib/documentsStore";
import { useAuth } from "@shared/lib/authStore";
import {
  DOCUMENT_KIND_LABELS,
  type ProjectDocument,
  type JobPiece,
  type PieceKind,
  type CutMethod,
} from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DrawingUpload } from "./DrawingUpload";
import { DrawingDoc } from "./DrawingDoc";
import { PiecePin } from "./PiecePin";
import { PieceCreateForm } from "./PieceCreateForm";
import { PieceChecklist } from "./PieceChecklist";
import { removeDrawing } from "../lib/storage";
import { usePieces, useProjectPieces } from "../lib/piecesStore";
import { nextStatus } from "../lib/pipelines";

function newId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `piece_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export function DrawingsView({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const docs = useProjectDocuments(jobId);
  const { deleteDocument } = useDocuments();
  const { user } = useAuth();
  const pieces = useProjectPieces(jobId);
  const { createPiece, updatePiece, deletePiece } = usePieces();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingPin, setAddingPin] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(true);

  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;
  // Slice 1: pins filter by document only (not page) — see plan's page note.
  const docPins = pieces.filter((p) => p.pinDocumentId === active?.id && p.pinX != null);

  function selectDoc(id: string) {
    setArmedId(null);
    setActiveId(id);
  }

  async function onTrashDoc(doc: ProjectDocument) {
    if (busyId) return;
    if (armedId !== doc.id) { setArmedId(doc.id); return; }
    setBusyId(doc.id);
    try {
      if (doc.source === "upload" && doc.storagePath) await removeDrawing(doc.storagePath);
      await deleteDocument(doc.id);
      if (activeId === doc.id) setActiveId(null);
    } finally {
      setBusyId(null);
      setArmedId(null);
    }
  }

  function handlePlace(x: number, y: number) {
    setPendingPin({ x, y });
    setAddingPin(false);
  }

  async function handleCreate(d: { kind: PieceKind; label: string; code?: string; subtype?: string }) {
    if (!pendingPin || !active) return;
    const id = newId();
    await createPiece({
      id, projectId: jobId, kind: d.kind, label: d.label, code: d.code ?? null,
      subtype: d.subtype ?? null, room: null, cutMethod: null, status: "not_started",
      statusUpdatedAt: null, statusUpdatedBy: null, source: "manual", sourceRef: null,
      pinDocumentId: active.id, pinPage: 1, pinX: pendingPin.x, pinY: pendingPin.y,
      sortOrder: pieces.length, dimensions: null, material: null, edgeband: null,
      parentRef: null, createdBy: user?.email ?? null, createdAt: new Date().toISOString(),
    });
    setPendingPin(null);
    setSelectedPieceId(id);
  }

  async function handleAdvance(p: JobPiece) {
    const to = nextStatus(p.kind, p.status);
    if (!to) return;
    await updatePiece(p.id, {
      status: to, statusUpdatedAt: new Date().toISOString(), statusUpdatedBy: user?.email ?? null,
    });
  }

  async function handleSetStatus(p: JobPiece, status: string) {
    await updatePiece(p.id, {
      status, statusUpdatedAt: new Date().toISOString(), statusUpdatedBy: user?.email ?? null,
    });
  }

  async function handleSetCutMethod(p: JobPiece, m: CutMethod) {
    await updatePiece(p.id, { cutMethod: m });
  }

  async function handleDeletePiece(p: JobPiece) {
    await deletePiece(p.id);
    if (selectedPieceId === p.id) setSelectedPieceId(null);
  }

  const canPin = active != null && active.source !== "link";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary duration-fast">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="truncate font-serif text-title text-text-primary">
            {job ? `${job.name} — Drawings` : "Drawings"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPin && (
            <button type="button" onClick={() => { setAddingPin((v) => !v); setPendingPin(null); }}
              aria-pressed={addingPin}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
                addingPin ? "bg-ink-pill text-white" : "border border-border bg-surface text-text-secondary hover:bg-surface-muted"
              )}>
              <MapPin className="h-4 w-4" /> {addingPin ? "Tap drawing to place" : "Add pin"}
            </button>
          )}
          <button type="button" onClick={() => setShowChecklist((v) => !v)}
            aria-pressed={showChecklist}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
              showChecklist ? "bg-surface-muted text-text-primary" : "border border-border bg-surface text-text-secondary hover:bg-surface-muted"
            )}>
            <ListChecks className="h-4 w-4" /> Checklist
          </button>
          <DrawingUpload jobId={jobId} />
        </div>
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
                  <button onClick={() => selectDoc(d.id)}
                    className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center rounded-md px-2.5 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                    <span className={cn("block truncate",
                      active?.id === d.id ? "text-text-primary" : "text-text-secondary")}>
                      {d.label}
                    </span>
                    <span className="text-micro uppercase tracking-wider text-text-tertiary">
                      {DOCUMENT_KIND_LABELS[d.kind]}{d.source === "link" ? " · link" : ""}
                    </span>
                  </button>
                  <button onClick={() => onTrashDoc(d)} disabled={busyId === d.id}
                    className={cn(
                      "flex h-11 w-9 shrink-0 items-center justify-center rounded-md duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40",
                      armed ? "bg-status-blocked text-white" : "text-text-tertiary hover:bg-status-blocked-soft hover:text-status-blocked"
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

        <main className="relative min-w-0 flex-1 overflow-auto p-4">
          {active ? (
            <DrawingDoc doc={active} addingPin={addingPin} onPlace={handlePlace}
              overlay={docPins.map((p) => (
                <PiecePin key={p.id} piece={p} selected={selectedPieceId === p.id}
                  onSelect={() => setSelectedPieceId(p.id)} />
              ))} />
          ) : (
            <p className="text-sm text-text-tertiary">Select or upload a drawing.</p>
          )}

          {pendingPin && (
            <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/10 p-6">
              <div className="mt-12 w-72 max-w-full">
                <PieceCreateForm onCancel={() => setPendingPin(null)} onCreate={handleCreate} />
              </div>
            </div>
          )}
        </main>

        {showChecklist && (
          <aside className="w-72 shrink-0 overflow-auto border-l border-border bg-surface">
            <PieceChecklist pieces={pieces} selectedId={selectedPieceId}
              onSelect={(p) => setSelectedPieceId(p.id)} onAdvance={handleAdvance}
              onSetStatus={handleSetStatus} onSetCutMethod={handleSetCutMethod}
              onDelete={handleDeletePiece} />
          </aside>
        )}
      </div>
    </div>
  );
}
