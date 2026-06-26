"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, RefreshCw, X } from "lucide-react";
import { formatError } from "@shared/lib/formatError";
import { hasSupabase } from "@shared/lib/supabase";
import { useJobEvents, getPhotoSignedUrl } from "../lib/eventStore";
import { JOB_ITEM_STATUS_LABELS } from "../lib/statusPill";
import type { JobItemEvent, JobItemStatus } from "../lib/types";

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
    return <span className="text-xs text-text-tertiary italic">(photo unavailable)</span>;
  }
  if (!url) {
    return <span className="text-xs text-text-tertiary animate-pulse">Loading photo…</span>;
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

type OnAdd = (note: string, file: File | null) => Promise<void>;

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
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async () => {
    if (!note.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(note.trim(), file);
      onClose();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }, [note, file, onAdd, onClose]);

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
          className="text-text-tertiary hover:text-text-secondary"
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
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary shadow-resting transition-colors duration-fast hover:bg-surface-muted"
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
            className="text-xs text-text-tertiary hover:text-red-500"
          >
            Remove
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || (!note.trim() && !file)}
          data-testid="capture-submit-btn"
          className="ml-auto inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-resting transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
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
    async (note: string, file: File | null) => {
      if (!selectedItemId) return;
      if (file) {
        await addPhoto({
          itemId: selectedItemId,
          itemKind: "job_item",
          file,
          caption: note || undefined,
        });
      } else if (note) {
        await addNote({
          itemId: selectedItemId,
          itemKind: "job_item",
          note,
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
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-text-tertiary">Add note or photo to:</span>
              {items.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  aria-label={`Add note or photo to ${item.label}`}
                  data-testid="timeline-item-picker-btn"
                  className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-fast hover:bg-surface-muted"
                >
                  {item.label}
                </button>
              ))}
            </div>
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
        <p className="text-sm text-text-tertiary">Loading timeline…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-text-tertiary">No activity yet.</p>
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
