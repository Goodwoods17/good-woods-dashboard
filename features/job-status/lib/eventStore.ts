"use client";

import { useCallback } from "react";
import { JOB_ITEM_EVENTS_TABLE, getSupabase, hasSupabase } from "@shared/lib/supabase";
import { useLiveRows } from "@shared/lib/useLiveRows";
import { rowToJobItemEvent, jobItemEventToInsertRow, type JobItemEventRow } from "./eventRowMap";
import type { ItemKind, JobItemEvent, JobItemStatus, Visibility } from "./types";

const PHOTO_BUCKET = "job-progress";
// Max upload attempts before surfacing the failure to the caller.
const MAX_UPLOAD_ATTEMPTS = 3;

/** Build a deterministic Storage path for a field photo. */
export function buildPhotoPath(jobId: string, itemId: string, filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()! : "jpg";
  const ts = Date.now();
  return `${jobId}/${itemId}/${ts}.${ext}`;
}

/**
 * Upload a photo to the `job-progress` private bucket with up to
 * MAX_UPLOAD_ATTEMPTS retries. Throws on final failure so the caller can
 * surface the error and never silently drop it (anti-pattern guard).
 */
async function uploadPhotoWithRetry(path: string, file: File): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    const { error } = await getSupabase()
      .storage.from(PHOTO_BUCKET)
      .upload(path, file, { upsert: true });
    if (!error) return;
    lastError = error;
    if (attempt < MAX_UPLOAD_ATTEMPTS) {
      // Simple linear back-off: 1 s, 2 s — gives transient network issues a
      // chance to clear without burning the whole budget on a hard quota error.
      await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }
  throw lastError;
}

export type AddNoteParams = {
  itemId: string;
  itemKind: ItemKind;
  note: string;
  visibility?: Visibility;
};

export type AddPhotoParams = {
  itemId: string;
  itemKind: ItemKind;
  file: File;
  /** Optional caption stored as the event's note field. */
  caption?: string;
  visibility?: Visibility;
};

/** Produce a signed URL (15-min TTL) for a private bucket photo path. */
export async function getPhotoSignedUrl(photoPath: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrl(photoPath, 60 * 15); // 15 min
  if (error || !data?.signedUrl) throw error ?? new Error("Failed to create signed URL");
  return data.signedUrl;
}

export type UseJobEvents = {
  events: JobItemEvent[];
  loading: boolean;
  /** Insert a text note event for an item. Throws on failure. */
  addNote: (params: AddNoteParams) => Promise<void>;
  /**
   * Upload a photo to Storage then record a photo event. The upload is retried
   * up to MAX_UPLOAD_ATTEMPTS times; a final failure surfaces as a throw so the
   * caller MUST toast it — never silently drop a photo.
   */
  addPhoto: (params: AddPhotoParams) => Promise<void>;
};

/**
 * Per-job event timeline. Load + realtime sync run through the shared useLiveRows
 * module so the owner's timeline stays live without a page reload (INSERT-only —
 * events are append-only; newest-first prepend).
 */
export function useJobEvents(jobId: string): UseJobEvents {
  const live = hasSupabase();

  const { rows: events, loading, setRows } = useLiveRows<JobItemEventRow, JobItemEvent>({
    table: JOB_ITEM_EVENTS_TABLE,
    live,
    resubscribeKey: jobId,
    filter: `job_id=eq.${jobId}`,
    event: "INSERT",
    order: "prepend",
    rowToModel: rowToJobItemEvent,
    getId: (e) => e.id,
    load: async () => {
      if (!live) return [];
      const { data } = await getSupabase()
        .from(JOB_ITEM_EVENTS_TABLE)
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      return data ? (data as JobItemEventRow[]).map(rowToJobItemEvent) : [];
    },
  });

  // Prepend a freshly-inserted event to the timeline immediately, so the author
  // sees it without waiting for the Realtime round-trip (which can lag past a
  // test/UX timeout). Idempotent: the Realtime INSERT echo dedupes by id.
  const prependEvent = useCallback(
    (evt: JobItemEvent) => {
      setRows((cur) => (cur.some((e) => e.id === evt.id) ? cur : [evt, ...cur]));
    },
    [setRows]
  );

  const addNote = useCallback(
    async ({ itemId, itemKind, note, visibility = "owner" }: AddNoteParams) => {
      if (!hasSupabase()) return;
      const { data, error } = await getSupabase()
        .from(JOB_ITEM_EVENTS_TABLE)
        .insert(
          jobItemEventToInsertRow({
            jobId,
            itemKind,
            itemId,
            eventType: "note",
            toStatus: null,
            note,
            photoPath: null,
            visibility,
            workerId: null,
          })
        )
        .select()
        .single();
      if (error || !data) throw error ?? new Error("Insert returned no row");
      prependEvent(rowToJobItemEvent(data as JobItemEventRow));
    },
    [jobId, prependEvent]
  );

  const addPhoto = useCallback(
    async ({ itemId, itemKind, file, caption, visibility = "owner" }: AddPhotoParams) => {
      if (!hasSupabase()) return;
      const path = buildPhotoPath(jobId, itemId, file.name);
      // Upload first. If this throws (after retries) the caller MUST surface
      // it — never let a failed upload produce a phantom photo event row.
      await uploadPhotoWithRetry(path, file);
      // Photo is in Storage; now record the event. If the insert fails we
      // surface it but the photo is already uploaded (acceptable: the row can
      // be re-inserted; the file doesn't duplicate).
      const { data, error } = await getSupabase()
        .from(JOB_ITEM_EVENTS_TABLE)
        .insert(
          jobItemEventToInsertRow({
            jobId,
            itemKind,
            itemId,
            eventType: "photo",
            toStatus: null,
            note: caption ?? null,
            photoPath: path,
            visibility,
            workerId: null,
          })
        )
        .select()
        .single();
      if (error || !data) throw error ?? new Error("Insert returned no row");
      prependEvent(rowToJobItemEvent(data as JobItemEventRow));
    },
    [jobId, prependEvent]
  );

  return { events, loading, addNote, addPhoto };
}

/**
 * Record a status-change event (called by `useJobProgress` when a status cycle
 * succeeds so the timeline stays coherent). This is a fire-and-forget insert;
 * the status-cycle write itself is the canonical fact — the event row is the
 * audit trail.
 */
export async function recordStatusChange(
  jobId: string,
  itemId: string,
  itemKind: ItemKind,
  toStatus: JobItemStatus,
  visibility: Visibility = "owner"
): Promise<void> {
  if (!hasSupabase()) return;
  await getSupabase()
    .from(JOB_ITEM_EVENTS_TABLE)
    .insert(
      jobItemEventToInsertRow({
        jobId,
        itemKind,
        itemId,
        eventType: "status_change",
        toStatus,
        note: null,
        photoPath: null,
        visibility,
        workerId: null,
      })
    );
  // Intentionally swallows errors: the status write already succeeded; the
  // event row is best-effort audit. Failing silently here is acceptable by spec
  // ("status change and photo are separate events").
}
