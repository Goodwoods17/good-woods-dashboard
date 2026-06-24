"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, ListChecks } from "lucide-react";
import { useJob } from "@features/jobs/lib/jobsStore";
import { useProjectDocuments, useDocuments } from "@features/documents/lib/documentsStore";
import { useAuth } from "@shared/lib/authStore";
import {
  DOCUMENT_KIND_LABELS,
  type ProjectDocument,
  type JobPiece,
  type PieceKind,
  type CutMethod,
  type Annotation,
  type AnnotationType,
  type StrokeData,
  type ShapeData,
  type ShapeKind,
} from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DrawingUpload } from "./DrawingUpload";
import { DrawingDoc } from "./DrawingDoc";
import { PiecePin } from "./PiecePin";
import { PieceCreateForm } from "./PieceCreateForm";
import { PieceChecklist } from "./PieceChecklist";
import { MarkupToolbar, type Tool } from "./MarkupToolbar";
import { MarkupLayer } from "./MarkupLayer";
import { TextNoteEditor } from "./TextNoteEditor";
import { removeDrawing } from "../lib/storage";
import { usePieces, useProjectPieces } from "../lib/piecesStore";
import { useAnnotations, useDocAnnotations } from "../lib/annotationsStore";
import { useMarkupHistory } from "../lib/useMarkupHistory";
import { PEN_COLORS, HIGHLIGHTER_COLORS } from "../lib/strokes";
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
  const { createAnnotation, updateAnnotation, deleteAnnotation, restoreAnnotation } = useAnnotations();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pan");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(true);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_COLORS[0]);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("arrow");
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<{ id?: string; x: number; y: number; value: string } | null>(null);

  const active = docs.find((d) => d.id === activeId) ?? docs[0] ?? null;
  // Slice 3: pins + ink both filter by document AND current page.
  const docPins = pieces.filter(
    (p) => p.pinDocumentId === active?.id && p.pinX != null && (p.pinPage ?? 1) === currentPage
  );
  const docAnnotations = useDocAnnotations(active?.id ?? null, currentPage);
  const selectedAnnotation = docAnnotations.find((a) => a.id === selectedAnnId) ?? null;

  const history = useMarkupHistory({
    onAdd: (a) => restoreAnnotation(a),
    onRemove: (id) => deleteAnnotation(id),
    onUpdate: (a) => updateAnnotation(a.id, a),
  });

  // ⌘Z / Ctrl+Z undo, ⇧⌘Z redo, Delete/Backspace removes the selected markup —
  // all ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo(); else history.undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotation) {
        e.preventDefault();
        void deleteAnnotation(selectedAnnotation.id);
        history.recordDelete(selectedAnnotation);
        setSelectedAnnId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, selectedAnnotation, deleteAnnotation]);

  function selectDoc(id: string) {
    setArmedId(null);
    setActiveId(id);
    setSelectedPieceId(null);
  }

  function selectTool(t: Tool) {
    setActiveTool(t);
    setPendingPin(null);
    if (t !== "select") setSelectedAnnId(null);
    setEditingText(null);
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
    if (activeTool !== "pin") return;
    setPendingPin({ x, y });
    setActiveTool("pan");
  }

  async function handleCreate(d: { kind: PieceKind; label: string; code?: string; subtype?: string }) {
    if (!pendingPin || !active) return;
    const id = newId();
    await createPiece({
      id, projectId: jobId, kind: d.kind, label: d.label, code: d.code ?? null,
      subtype: d.subtype ?? null, room: null, cutMethod: null, status: "not_started",
      statusUpdatedAt: null, statusUpdatedBy: null, source: "manual", sourceRef: null,
      pinDocumentId: active.id, pinPage: currentPage, pinX: pendingPin.x, pinY: pendingPin.y,
      sortOrder: pieces.length, dimensions: null, material: null, edgeband: null,
      parentRef: null, createdBy: user?.email ?? null, createdAt: new Date().toISOString(),
    });
    setPendingPin(null);
    setSelectedPieceId(id);
  }

  async function handleCommitStroke(s: {
    type: AnnotationType; color: string; size: number; data: StrokeData;
  }) {
    if (!active) return;
    const now = new Date().toISOString();
    const a: Annotation = {
      id: newId(), documentId: active.id, projectId: jobId, page: currentPage,
      type: s.type, data: s.data, color: s.color, strokeWidth: s.size,
      createdBy: user?.email ?? null, createdAt: now, updatedAt: now,
    };
    await createAnnotation(a);
    history.recordAdd(a);
  }

  async function handleErase(a: Annotation) {
    await deleteAnnotation(a.id);
    history.recordDelete(a);
    if (selectedAnnId === a.id) setSelectedAnnId(null);
  }

  async function handleCommitShape(s: { color: string; size: number; data: ShapeData }) {
    if (!active) return;
    const now = new Date().toISOString();
    const a: Annotation = {
      id: newId(), documentId: active.id, projectId: jobId, page: currentPage,
      type: "shape", data: s.data, color: s.color, strokeWidth: s.size,
      createdBy: user?.email ?? null, createdAt: now, updatedAt: now,
    };
    await createAnnotation(a);
    history.recordAdd(a);
  }

  function handleRequestText(x: number, y: number) {
    setEditingText({ x, y, value: "" });
  }

  function handleEditText(a: Annotation) {
    if (a.type !== "text") return;
    const d = a.data as { x: number; y: number; text: string; fontSize: number };
    setEditingText({ id: a.id, x: d.x, y: d.y, value: d.text });
  }

  async function handleCommitText(value: string) {
    const editing = editingText;
    setEditingText(null);
    if (!editing || !active) return;
    const text = value.trim();
    if (editing.id) {
      const before = docAnnotations.find((a) => a.id === editing.id);
      if (!before) return;
      if (!text) { await deleteAnnotation(before.id); history.recordDelete(before); setSelectedAnnId(null); return; }
      const after: Annotation = {
        ...before, data: { ...(before.data as { x: number; y: number; fontSize: number }), text },
        updatedAt: new Date().toISOString(),
      };
      await updateAnnotation(after.id, after);
      history.recordUpdate(before, after);
      return;
    }
    if (!text) return;
    const now = new Date().toISOString();
    const a: Annotation = {
      id: newId(), documentId: active.id, projectId: jobId, page: currentPage,
      type: "text", data: { x: editing.x, y: editing.y, text, fontSize: 0.022 },
      color: penColor, strokeWidth: null, createdBy: user?.email ?? null, createdAt: now, updatedAt: now,
    };
    await createAnnotation(a);
    history.recordAdd(a);
  }

  async function handleUpdateAnnotation(before: Annotation, after: Annotation) {
    await updateAnnotation(after.id, after);
    history.recordUpdate(before, after);
  }

  async function handleDeleteSelection() {
    if (!selectedAnnotation) return;
    await deleteAnnotation(selectedAnnotation.id);
    history.recordDelete(selectedAnnotation);
    setSelectedAnnId(null);
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
  const canMarkup = active != null && active.source !== "link";

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
          {canMarkup && (
            <MarkupToolbar
              activeTool={activeTool} onTool={selectTool} canPin={canPin}
              penColor={penColor} onPenColor={setPenColor}
              highlighterColor={highlighterColor} onHighlighterColor={setHighlighterColor}
              shapeKind={shapeKind} onShapeKind={setShapeKind}
              selectionActive={selectedAnnotation != null} onDeleteSelection={handleDeleteSelection}
              canUndo={history.canUndo} canRedo={history.canRedo}
              onUndo={history.undo} onRedo={history.redo}
            />
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
            <DrawingDoc doc={active} disablePan={activeTool !== "pan"} onPlace={handlePlace}
              onPageChange={(p) => { setCurrentPage(p); setSelectedAnnId(null); setEditingText(null); }}
              overlay={
                <>
                  {docPins.map((p) => (
                    <PiecePin key={p.id} piece={p} selected={selectedPieceId === p.id}
                      onSelect={() => setSelectedPieceId(p.id)} />
                  ))}
                  <MarkupLayer annotations={docAnnotations} activeTool={activeTool}
                    penColor={penColor} highlighterColor={highlighterColor} shapeKind={shapeKind}
                    selectedId={selectedAnnId} onSelect={setSelectedAnnId}
                    onCommit={handleCommitStroke} onCommitShape={handleCommitShape}
                    onErase={handleErase} onUpdate={handleUpdateAnnotation}
                    onRequestText={handleRequestText} onEditText={handleEditText} />
                </>
              } />
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

          {editingText && (
            <TextNoteEditor
              initialValue={editingText.value}
              onCancel={() => setEditingText(null)}
              onSave={handleCommitText}
            />
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
