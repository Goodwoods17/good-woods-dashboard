"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, RefreshCw, X } from "lucide-react";
import { formatError } from "@shared/lib/formatError";
import { hasSupabase } from "@shared/lib/supabase";
import { useJobEvents, getPhotoSignedUrl } from "../lib/eventStore";
import { TimelineSkeleton } from "./Skeletons";
import { JOB_ITEM_STATUS_LABELS } from "../lib/statusPill";
import { VISIBILITY_LABELS, VISIBILITY_SHORT_LABELS, visibilityTone, nextVisibility } from "../lib/visibilityPill";
import type { JobItemEvent, JobItemStatus, Visibility } from "../lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Photo thumbnail ──────────────────────────────────────────────────────────

function PhotoThumbnail({ photoPath }: { photoPath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const signed = await getPhotoSignedUrl(photoPath);
        if (!cancelled) setUrl(signed);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  if (err) {
    return <span className="text-xs text-text-secondary italic">Photo unavailable</span>;
  }
  if (!url) {
    return <span className="text-xs text-text-secondary animate-pulse">Loading photo…</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block"
      aria-label="View photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Field photo"
        className="max-h-48 max-w-full rounded-md border border-border object-cover"
        data-testid="timeline-photo"
      />
    </a>
  );
}

// ─── Inline visibility chip (read-only, on an event card) ─────────────────────

function VisibilityChip({ visibility }: { visibility: Visibility }) {
  const tone = visibilityTone(visibility);
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone.bg} ${tone.text}`}
      data-testid="event-visibility-chip"
      data-visibility={visibility}
      aria-label={`Visibility: ${VISIBILITY_LABELS[visibility]}`}
    >
      {VISIBILITY_SHORT_LABELS[visibility]}
    </span>
  );
}

// ─── Single event card ────────────────────────────────────────────────────────

function EventCard({ event }: { event: JobItemEvent }) {
  const icon =
    event.eventType === "photo" ? (
      <Camera className="h-3.5 w-3.5" aria-hidden />
    ) : event.eventType === "note" ? (
      <FileText className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
    );

  const typeLabel =
    event.eventType === "status_change"
      ? `Status → ${JOB_ITEM_STATUS_LABELS[event.toStatus as JobItemStatus] ?? event.toStatus}`
      : event.eventType === "photo"
        ? "Photo"
        : "Note";

  return (
    <li
      className="flex gap-3 py-3 first:pt-0"
      data-testid="timeline-event"
      data-event-type={event.eventType}
    >
      {/* Icon column */}
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-tertiary">
        {icon}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-text-primary">{typeLabel}</span>
          <span className="text-xs text-text-tertiary">{formatTime(event.createdAt)}</span>
          {/* Slice 6: visibility chip on every event so the owner can see what
              the client will (or won't) see in the future portal. */}
          <VisibilityChip visibility={event.visibility} />
        </div>

        {event.note && (
          <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">{event.note}</p>
        )}

        {event.eventType === "photo" && event.photoPath && (
          <PhotoThumbnail photoPath={event.photoPath} />
        )}
      </div>
    </li>
  );
}

// ─── Note + photo capture form ────────────────────────────────────────────────

type OnAdd = (note: string, file: File | null, visibility: Visibility) => Promise<void>;

function CaptureForm({
  itemLabel,
  onAdd,
  onClose,
}: {
  itemLabel: string;
  onAdd: OnAdd;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Slice 6: default owner (private). User can promote to client or both.
  const [visibility, setVisibility] = useState<Visibility>("owner");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async () => {
    if (!note.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(note.trim(), file, visibility);
      onClose();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }, [note, file, visibility, onAdd, onClose]);

  return (
    <div
      className="mt-3 rounded-md border border-border bg-surface p-3 shadow-resting"
      data-testid="capture-form"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary truncate">
          Add to: {itemLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-text-secondary hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)…"
        aria-label="Note text"
        data-testid="capture-note-input"
        rows={3}
        className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      {/* File input — hidden, triggered by the button */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Choose photo"
        data-testid="capture-photo-input"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach photo"
          data-testid="capture-photo-btn"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs text-text-secondary shadow-resting transition-colors duration-fast hover:bg-surface-muted"
        >
          <Camera className="h-3.5 w-3.5" />
          {file ? file.name : "Photo"}
        </button>

        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            aria-label="Remove photo"
            className="inline-flex min-h-[44px] items-center text-xs text-text-secondary hover:text-red-600"
          >
            Remove
          </button>
        )}

        {/* Slice 6: visibility cycle button — tap to advance owner → client → both → owner */}
        <button
          type="button"
          onClick={() => setVisibility((v) => nextVisibility(v))}
          data-testid="capture-visibility-toggle"
          data-visibility={visibility}
          aria-label={`Event visibility: ${VISIBILITY_LABELS[visibility]}, tap to change`}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 text-xs font-medium transition-colors duration-fast ${visibilityTone(visibility).bg} ${visibilityTone(visibility).text}`}
        >
          {VISIBILITY_SHORT_LABELS[visibility]}
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={busy || (!note.trim() && !file)}
          data-testid="capture-submit-btn"
          className="ml-auto inline-flex min-h-[44px] items-center rounded-md bg-accent px-3 text-xs font-medium text-white shadow-resting transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert" data-testid="capture-error">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Per-job event timeline + note/photo capture. Shows the full append-only
 * `job_item_events` stream for a job (newest first), with a capture form that
 * can be opened per item. Live via Supabase Realtime.
 *
 * Props:
 * - `jobId`   — which job's events to show.
 * - `items`   — list of {id, label} for the capture form item picker.
 */
export function ItemTimeline({
  jobId,
  items,
}: {
  jobId: string;
  items: Array<{ id: string; label: string }>;
}) {
  const { events, loading, addNote, addPhoto } = useJobEvents(jobId);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const handleAdd = useCallback(
    async (note: string, file: File | null, visibility: Visibility) => {
      if (!selectedItemId) return;
      if (file) {
        await addPhoto({
          itemId: selectedItemId,
          itemKind: "job_item",
          file,
          caption: note || undefined,
          visibility,
        });
      } else if (note) {
        await addNote({
          itemId: selectedItemId,
          itemKind: "job_item",
          note,
          visibility,
        });
      }
    },
    [selectedItemId, addNote, addPhoto]
  );

  return (
    <section className="px-4 pb-10" data-testid="item-timeline">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Activity</h2>

      {/* Capture trigger: show item picker when none selected; show form when one is. */}
      {hasSupabase() && items.length > 0 && (
        <div className="mb-4">
          {!selectedItem ? (
            <>
              <p className="mb-1.5 text-xs text-text-secondary">Add note or photo to:</p>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    aria-label={`Add note or photo to ${item.label}`}
                    data-testid="timeline-item-picker-btn"
                    className="inline-flex min-h-[44px] max-w-full items-center rounded-md border border-border px-3 text-xs text-text-secondary transition-colors duration-fast hover:bg-surface-muted hover:text-text-primary"
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <CaptureForm
              itemLabel={selectedItem.label}
              onAdd={handleAdd}
              onClose={() => setSelectedItemId(null)}
            />
          )}
        </div>
      )}

      {loading ? (
        <TimelineSkeleton />
      ) : events.length === 0 ? (
        <div>
          <p className="text-sm text-text-secondary">No activity yet.</p>
          {hasSupabase() && items.length > 0 && (
            <p className="mt-1 text-xs text-text-tertiary">
              Tap an item above to add the first note or photo.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border" data-testid="timeline-list">
          {events.map((evt) => (
            <EventCard key={evt.id} event={evt} />
          ))}
        </ul>
      )}
    </section>
  );
}
