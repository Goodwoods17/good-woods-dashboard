"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useReface } from "../lib/refaceStore";
import { uploadPhoto } from "../lib/storage";
import { makeLabeler, newManualElement } from "../lib/importElements";
import type { ElementBox, ElementKind, RefacePhoto, RefaceProject } from "../lib/types";
import { resolvePhotoUrl } from "../lib/storage";
import { PhotoAnnotator } from "./PhotoAnnotator";
import { ElementCard } from "./ElementCard";
import { SummaryPanel } from "./SummaryPanel";
import { OrderSettingsForm } from "./OrderSettingsForm";
import { ExportMenu } from "./ExportMenu";
import { ImportDetected } from "./ImportDetected";
import { cn } from "@shared/lib/utils";

/** The per-project workspace: photos + pins on the left, summary/spec/export on the right. */
export function ProjectWorkspace({
  project,
  onBack,
}: {
  project: RefaceProject;
  onBack: () => void;
}) {
  const { jobs } = useJobs();
  const { addPhoto, deletePhoto, addElement, updateProject } = useReface();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activePhotoId, setActivePhotoId] = useState<string | null>(project.photos[0]?.id ?? null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<ElementKind>("door");
  const [uploading, setUploading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a valid active photo as photos come and go.
  useEffect(() => {
    if (project.photos.length === 0) {
      setActivePhotoId(null);
    } else if (!project.photos.some((p) => p.id === activePhotoId)) {
      setActivePhotoId(project.photos[0].id);
    }
  }, [project.photos, activePhotoId]);

  const activePhoto = project.photos.find((p) => p.id === activePhotoId) ?? null;
  const selectedElement = activePhoto?.elements.find((e) => e.id === selectedElementId) ?? null;
  const job = project.jobId ? jobs.find((j) => j.id === project.jobId) : undefined;
  const customer = { name: job?.client ?? "", address: job?.address ?? "" };

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      let nextSort = project.photos.reduce((m, p) => Math.max(m, p.sort), -1) + 1;
      for (const file of Array.from(files)) {
        const photoId = crypto.randomUUID();
        const { storagePath, width, height } = await uploadPhoto(project.id, photoId, file);
        const photo: RefacePhoto = {
          id: photoId,
          projectId: project.id,
          storagePath,
          width,
          height,
          sort: nextSort++,
          createdAt: new Date().toISOString(),
          elements: [],
        };
        await addPhoto(photo);
        setActivePhotoId(photoId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleAddPin(kind: ElementKind, box: ElementBox) {
    if (!activePhoto) return;
    const el = newManualElement(project, activePhoto.id, kind, box, makeLabeler(project));
    addElement(el);
    setSelectedElementId(el.id);
  }

  return (
    <>
      <header className="px-8 pt-7 pb-5 flex items-start justify-between gap-6">
        <div className="min-w-0 flex items-start gap-3">
          <button
            onClick={onBack}
            className="mt-1 text-text-tertiary hover:text-text-primary transition-colors duration-fast"
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="text-label uppercase text-text-tertiary mb-1">Reface Studio</div>
            <input
              value={project.name}
              onChange={(e) => updateProject(project.id, { name: e.target.value })}
              className="font-serif text-headline font-medium text-text-primary bg-transparent border-none outline-none focus:ring-0 w-full"
            />
            <div className="mt-1.5">
              <select
                value={project.jobId ?? ""}
                onChange={(e) => updateProject(project.id, { jobId: e.target.value || null })}
                className="text-sm bg-surface border border-border rounded-md px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-border-strong"
              >
                <option value="">No linked job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} — {j.client}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="px-8 pb-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        {/* Left: photos + pins */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" strokeWidth={2} />
              )}
              Add photo
            </button>
            {activePhoto && (
              <>
                <button
                  onClick={() => setShowImport(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                  Import AI detection
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this photo and its pins?")) {
                      deletePhoto(activePhoto.id);
                      setSelectedElementId(null);
                    }
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full text-status-blocked hover:bg-status-blocked-soft px-3 py-2 text-sm font-medium transition-colors duration-fast"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>

          {error && <p className="text-caption text-status-blocked">{error}</p>}

          {activePhoto ? (
            <PhotoAnnotator
              photo={activePhoto}
              activeKind={activeKind}
              onActiveKindChange={setActiveKind}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onAddPin={handleAddPin}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-12 text-center">
              <p className="text-sm text-text-secondary">Add a kitchen photo to start measuring.</p>
            </div>
          )}

          {/* Photo strip */}
          {project.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {project.photos.map((p) => (
                <PhotoThumb
                  key={p.id}
                  photo={p}
                  active={p.id === activePhotoId}
                  onClick={() => {
                    setActivePhotoId(p.id);
                    setSelectedElementId(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: summary, element editor, spec, export */}
        <div className="space-y-4">
          <SummaryPanel project={project} />
          {selectedElement && (
            <ElementCard element={selectedElement} onClose={() => setSelectedElementId(null)} />
          )}
          <OrderSettingsForm project={project} />
          <ExportMenu project={project} customer={customer} />
        </div>
      </div>

      {showImport && activePhoto && (
        <ImportDetected
          project={project}
          photo={activePhoto}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  );
}

function PhotoThumb({
  photo,
  active,
  onClick,
}: {
  photo: RefacePhoto;
  active: boolean;
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolvePhotoUrl(photo.storagePath)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.storagePath]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-16 w-20 shrink-0 rounded-lg overflow-hidden border-2 transition-colors duration-fast bg-surface-sunken",
        active ? "border-accent" : "border-transparent hover:border-border-strong"
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full grid place-items-center text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {photo.elements.length > 0 && (
        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-ink-pill text-white text-micro px-1.5 py-0.5">
          {photo.elements.length}
        </span>
      )}
    </button>
  );
}
