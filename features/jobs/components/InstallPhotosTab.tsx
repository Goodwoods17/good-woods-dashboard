"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
  X,
  ZoomIn,
  AlertCircle,
} from "lucide-react";
import type { MilestoneStage, ProjectDocument } from "@shared/lib/types";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { useDocuments, useProjectDocuments } from "@features/documents/lib/documentsStore";
import { useAuth } from "@shared/lib/authStore";
import { uploadDrawing } from "@features/drawings/lib/storage";
import { resolveDocumentUrl } from "@features/drawings/lib/storage";
import { cn } from "@shared/lib/utils";
import {
  parsePhotoTag,
  serializePhotoTag,
  newPhotoIssue,
  upsertIssue,
  removeIssue,
  type PhotoTag,
  type PhotoPosition,
  type PhotoIssue,
} from "@features/jobs/lib/photoTagging";

// Photos only — no PDFs on the install gallery.
const ACCEPTED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
type AcceptedMime = (typeof ACCEPTED_PHOTO_MIME)[number];
const ACCEPT_ATTR = ACCEPTED_PHOTO_MIME.join(",");
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

/** The issue-pin footprint as a fraction of the displayed image. */
const NEW_ISSUE_SIZE = 0.06;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isAcceptedMime(mime: string): mime is AcceptedMime {
  return ACCEPTED_PHOTO_MIME.includes(mime as AcceptedMime);
}

function newDocId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** True when the document is an install photo (kind + upload source). */
function isPhoto(doc: ProjectDocument): boolean {
  return doc.kind === "photo" && doc.source === "upload";
}

/** Photos in milestone order, then before before after. */
function sortedPhotos(docs: ProjectDocument[]): ProjectDocument[] {
  const STAGE_ORDER = MILESTONE_STAGES.map((s) => s.key);
  const POS_ORDER: PhotoPosition[] = ["before", "after"];

  return docs.filter(isPhoto).sort((a, b) => {
    const tagA = parsePhotoTag(a.notes);
    const tagB = parsePhotoTag(b.notes);
    const milA = tagA ? STAGE_ORDER.indexOf(tagA.milestone) : Infinity;
    const milB = tagB ? STAGE_ORDER.indexOf(tagB.milestone) : Infinity;
    if (milA !== milB) return milA - milB;
    const posA = tagA ? POS_ORDER.indexOf(tagA.position) : Infinity;
    const posB = tagB ? POS_ORDER.indexOf(tagB.position) : Infinity;
    if (posA !== posB) return posA - posB;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

type GroupedTimeline = Array<{
  stage: MilestoneStage;
  label: string;
  before: ProjectDocument[];
  after: ProjectDocument[];
  untagged: ProjectDocument[];
}>;

function groupByMilestone(photos: ProjectDocument[]): GroupedTimeline {
  const map = new Map<MilestoneStage, { before: ProjectDocument[]; after: ProjectDocument[] }>();
  const untaggedGlobal: ProjectDocument[] = [];

  for (const p of photos) {
    const tag = parsePhotoTag(p.notes);
    if (!tag) {
      untaggedGlobal.push(p);
      continue;
    }
    if (!map.has(tag.milestone)) {
      map.set(tag.milestone, { before: [], after: [] });
    }
    map.get(tag.milestone)![tag.position].push(p);
  }

  const result: GroupedTimeline = [];
  for (const { key, label } of MILESTONE_STAGES) {
    const entry = map.get(key);
    if (entry && (entry.before.length > 0 || entry.after.length > 0)) {
      result.push({ stage: key, label, ...entry, untagged: [] });
    }
  }
  // Untagged photos append at the bottom as their own group.
  if (untaggedGlobal.length > 0) {
    result.push({
      stage: "design" as MilestoneStage, // placeholder key — never shown as chip
      label: "Untagged",
      before: [],
      after: [],
      untagged: untaggedGlobal,
    });
  }
  return result;
}

// ─── sub-components ──────────────────────────────────────────────────────────

/**
 * Issue-pin dot rendered absolutely over the photo. Matches the visual style
 * of the reface PhotoAnnotator's ElementPin but simplified to a single "issue"
 * kind (amber — at-risk colour from the design tokens).
 */
function IssueDot({
  issue,
  selected,
  index,
  onClick,
}: {
  issue: PhotoIssue;
  selected: boolean;
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid="photo-issue-pin"
      className={cn(
        "absolute flex items-center justify-center rounded-full text-white text-[10px] font-bold",
        "transition-all duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
        selected
          ? "bg-status-at-risk ring-2 ring-white shadow-lg scale-125"
          : "bg-status-at-risk/90 hover:scale-110"
      )}
      style={{
        left: `${issue.box.x * 100}%`,
        top: `${issue.box.y * 100}%`,
        width: `${issue.box.w * 100}%`,
        height: `${issue.box.h * 100}%`,
        minWidth: 22,
        minHeight: 22,
      }}
      title={issue.note || `Issue ${index + 1}`}
    >
      {index + 1}
    </button>
  );
}

/**
 * Single photo thumbnail in the grid. Loads a signed URL from Storage.
 */
function PhotoThumb({
  doc,
  onClick,
}: {
  doc: ProjectDocument;
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tag = parsePhotoTag(doc.notes);
  const issueCount = tag?.issues.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (doc.storagePath) {
      resolveDocumentUrl(doc.storagePath)
        .then((u) => { if (!cancelled) setUrl(u); })
        .catch(() => { if (!cancelled) setFailed(true); });
    } else {
      setFailed(true);
    }
    return () => { cancelled = true; };
  }, [doc.storagePath]);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="photo-thumb"
      data-doc-id={doc.id}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-surface-sunken",
        "aspect-[4/3] w-full transition-all duration-fast",
        "hover:border-border-strong hover:shadow-resting focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      )}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={doc.label}
          className="h-full w-full object-cover transition-transform duration-base group-hover:scale-105"
          draggable={false}
        />
      ) : failed ? (
        <div className="absolute inset-0 grid place-items-center text-text-tertiary">
          <ImageOff className="h-5 w-5" strokeWidth={1.5} />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-text-tertiary">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-ink-pill/0 group-hover:bg-ink-pill/20 transition-colors duration-fast grid place-items-center">
        <ZoomIn
          className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
          strokeWidth={1.75}
        />
      </div>
      {/* Issue count badge */}
      {issueCount > 0 && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-status-at-risk/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <AlertCircle className="h-2.5 w-2.5" strokeWidth={2} />
          {issueCount}
        </div>
      )}
      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink-pill/60 to-transparent px-2 py-2">
        <p className="text-[11px] font-medium text-white truncate leading-tight">{doc.label}</p>
      </div>
    </button>
  );
}

/**
 * Lightbox: full-size photo with click-to-mark-issue overlay (reface
 * PhotoAnnotator pattern adapted for install-issue marking).
 */
function PhotoLightbox({
  doc,
  onClose,
  onSaveTag,
  onDelete,
}: {
  doc: ProjectDocument;
  onClose: () => void;
  onSaveTag: (notes: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tag, setTag] = useState<PhotoTag>(() => parsePhotoTag(doc.notes) ?? {
    milestone: "install",
    position: "after",
    issues: [],
  });
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const imgWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (doc.storagePath) {
      resolveDocumentUrl(doc.storagePath)
        .then((u) => { if (!cancelled) setUrl(u); })
        .catch(() => { if (!cancelled) setFailed(true); });
    } else {
      setFailed(true);
    }
    return () => { cancelled = true; };
  }, [doc.storagePath]);

  // Keep editing note in sync when selection changes.
  useEffect(() => {
    if (selectedIssueId) {
      const issue = tag.issues.find((i) => i.id === selectedIssueId);
      setEditingNote(issue?.note ?? "");
    } else {
      setEditingNote("");
    }
  }, [selectedIssueId, tag.issues]);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const issue = newPhotoIssue({
      x: Math.max(0, Math.min(1 - NEW_ISSUE_SIZE, x - NEW_ISSUE_SIZE / 2)),
      y: Math.max(0, Math.min(1 - NEW_ISSUE_SIZE, y - NEW_ISSUE_SIZE / 2)),
      w: NEW_ISSUE_SIZE,
      h: NEW_ISSUE_SIZE,
    });
    setTag((t) => upsertIssue(t, issue));
    setSelectedIssueId(issue.id);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveTag(serializePhotoTag(tag));
    } finally {
      setSaving(false);
    }
  }

  function handleNoteBlur() {
    if (!selectedIssueId) return;
    const issue = tag.issues.find((i) => i.id === selectedIssueId);
    if (issue && editingNote !== issue.note) {
      setTag((t) => upsertIssue(t, { ...issue, note: editingNote }));
    }
  }

  function handleDeleteIssue(id: string) {
    setTag((t) => removeIssue(t, id));
    if (selectedIssueId === id) setSelectedIssueId(null);
  }

  const selectedIssue = tag.issues.find((i) => i.id === selectedIssueId) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-pill/80 p-4"
      data-testid="photo-lightbox"
    >
      <div className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-surface shadow-lg overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">{doc.label}</h3>
            {tag && (
              <p className="text-xs text-text-tertiary">
                {MILESTONE_STAGES.find((s) => s.key === tag.milestone)?.label} ·{" "}
                <span className="capitalize">{tag.position}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              data-testid="photo-save-issues"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill px-3 py-1.5 text-xs font-medium text-white transition-colors duration-fast hover:bg-accent-active disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save issues"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm("Remove this photo? It will be permanently deleted.")) {
                  await onDelete();
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-text-tertiary hover:text-status-blocked transition-colors duration-fast"
              title="Delete photo"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors duration-fast"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Photo + pin overlay */}
          <div className="flex-1 min-w-0 bg-surface-sunken overflow-hidden">
            <div
              ref={imgWrapRef}
              onClick={handleImageClick}
              data-testid="photo-annotator"
              className="relative h-full w-full cursor-crosshair select-none"
            >
              {url && !failed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={doc.label}
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              ) : failed ? (
                <div className="absolute inset-0 grid place-items-center text-text-tertiary">
                  <div className="flex flex-col items-center gap-2 text-sm">
                    <ImageOff className="h-6 w-6" strokeWidth={1.5} />
                    Could not load photo
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center text-text-tertiary">
                  <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
                </div>
              )}
              {tag.issues.map((issue, idx) => (
                <IssueDot
                  key={issue.id}
                  issue={issue}
                  selected={issue.id === selectedIssueId}
                  index={idx}
                  onClick={() =>
                    setSelectedIssueId((prev) => (prev === issue.id ? null : issue.id))
                  }
                />
              ))}
            </div>
          </div>

          {/* Issue sidebar */}
          <aside
            className="w-64 shrink-0 border-l border-border flex flex-col overflow-hidden"
            data-testid="photo-issue-sidebar"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary font-semibold">
                Issue notes
              </p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                Tap the photo to drop a numbered issue pin.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tag.issues.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-text-tertiary">
                  No issues marked yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {tag.issues.map((issue, idx) => (
                    <li
                      key={issue.id}
                      data-testid="photo-issue-item"
                      className={cn(
                        "px-4 py-3 cursor-pointer transition-colors duration-fast",
                        selectedIssueId === issue.id
                          ? "bg-surface-muted/60"
                          : "hover:bg-surface-muted/40"
                      )}
                      onClick={() =>
                        setSelectedIssueId((prev) => (prev === issue.id ? null : issue.id))
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-status-at-risk/90 text-white text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {selectedIssueId === issue.id ? (
                            <textarea
                              value={editingNote}
                              onChange={(e) => setEditingNote(e.target.value)}
                              onBlur={handleNoteBlur}
                              autoFocus
                              rows={2}
                              placeholder="Describe the issue…"
                              className="w-full text-xs text-text-primary bg-surface border border-border rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-accent-soft"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <p className="text-xs text-text-secondary truncate">
                              {issue.note || <span className="italic text-text-tertiary">No note</span>}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteIssue(issue.id);
                          }}
                          className="shrink-0 text-text-tertiary hover:text-status-blocked transition-colors duration-fast"
                          title="Remove this issue"
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Upload form ──────────────────────────────────────────────────────────────

function PhotoUploadRow({
  jobId,
  onUploaded,
}: {
  jobId: string;
  onUploaded: () => void;
}) {
  const { createDocument } = useDocuments();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [milestone, setMilestone] = useState<MilestoneStage>("install");
  const [position, setPosition] = useState<PhotoPosition>("after");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAcceptedMime(file.type)) {
      setErr("Only JPG, PNG, or WebP images can be uploaded as install photos.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr("Photo is too large — maximum is 20 MB.");
      return;
    }
    setErr(null);
    setBusy(true);
    const id = newDocId();
    const tag: PhotoTag = { milestone, position, issues: [] };
    try {
      const { storagePath } = await uploadDrawing(jobId, id, file);
      await createDocument({
        id,
        projectId: jobId,
        kind: "photo",
        label: file.name,
        driveUrl: null,
        version: null,
        isCurrent: true,
        notes: serializePhotoTag(tag),
        uploadedBy: user?.email ?? null,
        createdAt: new Date().toISOString(),
        source: "upload",
        storagePath,
        mime: file.type,
        pageCount: 1,
      });
      onUploaded();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-surface-muted/30 px-5 py-4"
      data-testid="photo-upload-row"
    >
      {/* Milestone picker */}
      <div className="space-y-1">
        <label htmlFor="photo-milestone" className="text-xs text-text-tertiary font-medium">
          Milestone
        </label>
        <select
          id="photo-milestone"
          value={milestone}
          onChange={(e) => setMilestone(e.target.value as MilestoneStage)}
          disabled={busy}
          className="min-h-[36px] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-50"
        >
          {MILESTONE_STAGES.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Before / After toggle */}
      <div className="space-y-1">
        <span className="text-xs text-text-tertiary font-medium">Position</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["before", "after"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              disabled={busy}
              data-testid={`photo-position-${pos}`}
              className={cn(
                "px-4 py-1.5 text-sm font-medium capitalize transition-colors duration-fast",
                position === pos
                  ? "bg-ink-pill text-white"
                  : "bg-surface text-text-secondary hover:text-text-primary"
              )}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={onPick}
          className="hidden"
          data-testid="photo-file-input"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          data-testid="photo-upload-btn"
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ink-pill px-4 py-2 text-sm font-medium text-white",
            "transition-colors duration-fast hover:bg-accent-active",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
            "disabled:cursor-not-allowed disabled:bg-text-disabled"
          )}
        >
          <Camera className="h-4 w-4" strokeWidth={1.75} />
          {busy ? "Uploading…" : "Upload photo"}
        </button>
      </div>

      {err && (
        <p className="w-full text-xs text-status-blocked">{err}</p>
      )}
    </div>
  );
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div
      className="px-6 py-16 text-center"
      data-testid="photos-empty-state"
    >
      <Camera className="h-8 w-8 text-text-tertiary mx-auto mb-3" strokeWidth={1.25} />
      <h4 className="font-serif text-title font-medium text-text-primary mb-1">
        No install photos yet
      </h4>
      <p className="text-sm text-text-secondary max-w-sm mx-auto leading-relaxed mb-5">
        Upload before and after photos for each milestone. Tap any photo to mark
        issues with numbered pins.
      </p>
      <button
        type="button"
        onClick={onAddClick}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Upload the first photo
      </button>
    </div>
  );
}

// ─── main tab ────────────────────────────────────────────────────────────────

export function InstallPhotosTab({ jobId }: { jobId: string }) {
  const allDocs = useProjectDocuments(jobId);
  const { updateDocument, deleteDocument } = useDocuments();
  const [showUpload, setShowUpload] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  const photos = sortedPhotos(allDocs);
  const timeline = groupByMilestone(photos);
  const activePhoto = activePhotoId ? allDocs.find((d) => d.id === activePhotoId) ?? null : null;

  const handleSaveTag = useCallback(
    async (notes: string) => {
      if (!activePhotoId) return;
      await updateDocument(activePhotoId, { notes });
    },
    [activePhotoId, updateDocument]
  );

  const handleDelete = useCallback(
    async () => {
      if (!activePhotoId) return;
      await deleteDocument(activePhotoId);
    },
    [activePhotoId, deleteDocument]
  );

  return (
    <div data-testid="install-photos-tab" className="space-y-6">
      {/* Upload header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-semibold">
            Install Photos
          </h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Before and after photos by milestone. Click any photo to mark issues.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          data-testid="photo-toggle-upload"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
            showUpload
              ? "bg-surface-muted text-text-secondary hover:text-text-primary"
              : "bg-ink-pill text-white hover:bg-accent-active"
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {showUpload ? "Close" : "Add photo"}
        </button>
      </div>

      {showUpload && (
        <PhotoUploadRow
          jobId={jobId}
          onUploaded={() => setShowUpload(false)}
        />
      )}

      {photos.length === 0 ? (
        <EmptyState onAddClick={() => setShowUpload(true)} />
      ) : (
        <div className="space-y-8" data-testid="photos-timeline">
          {timeline.map((group) => (
            <section key={`${group.stage}-${group.label}`}>
              {/* Milestone heading */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-[0.06em] text-text-tertiary px-2">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {group.untagged.length > 0 && (
                <PhotoGrid photos={group.untagged} onSelect={setActivePhotoId} />
              )}

              {group.before.length > 0 && (
                <div className="mb-5">
                  <PositionLabel position="before" />
                  <PhotoGrid photos={group.before} onSelect={setActivePhotoId} />
                </div>
              )}
              {group.after.length > 0 && (
                <div>
                  <PositionLabel position="after" />
                  <PhotoGrid photos={group.after} onSelect={setActivePhotoId} />
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {activePhoto && (
        <PhotoLightbox
          doc={activePhoto}
          onClose={() => setActivePhotoId(null)}
          onSaveTag={handleSaveTag}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function PositionLabel({ position }: { position: PhotoPosition }) {
  return (
    <p
      className={cn(
        "mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]",
        position === "before"
          ? "bg-surface-sunken text-text-tertiary"
          : "bg-status-on-track-soft text-status-on-track"
      )}
      data-testid={`position-label-${position}`}
    >
      {position === "before" ? "Before" : "After"}
    </p>
  );
}

function PhotoGrid({
  photos,
  onSelect,
}: {
  photos: ProjectDocument[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {photos.map((p) => (
        <PhotoThumb key={p.id} doc={p} onClick={() => onSelect(p.id)} />
      ))}
    </div>
  );
}
