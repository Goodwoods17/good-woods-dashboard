import type { MilestoneStage } from "@shared/lib/types";

// A trackable item's phase reuses the canonical 6-phase model (design → cnc →
// assembly → finishing → delivery → install). See CONTEXT.md (glossary).
export type Phase = MilestoneStage;

// A `job_item`'s progress state. Pieces carry their own Drawings lifecycle; the
// adapter (slice 4) normalises both to a `done` boolean for progress math.
export type JobItemStatus = "not_started" | "in_progress" | "blocked" | "done";

// Who may see an item/event. Default `owner`; the future client portal renders
// only `client | both`. Stored from day one, an enforced boundary only later.
export type Visibility = "owner" | "client" | "both";

// Where a job_item came from: a phase-step template, or an ad-hoc add.
export type JobItemSource = "template" | "adhoc";

export const JOB_ITEM_STATUSES: readonly JobItemStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
] as const;

export const VISIBILITIES: readonly Visibility[] = ["owner", "client", "both"] as const;

export const JOB_ITEM_SOURCES: readonly JobItemSource[] = ["template", "adhoc"] as const;

// A per-job trackable step (NOT a Drawings piece). Camera-cased domain model;
// the DB row shape lives in jobItemRowMap.ts.
export type JobItem = {
  id: string;
  jobId: string;
  phase: Phase;
  label: string;
  source: JobItemSource;
  templateId: string | null;
  status: JobItemStatus;
  visibility: Visibility;
  sortOrder: number;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
};

// ─── Event timeline types ─────────────────────────────────────────────────────

// The kind of event recorded on the timeline. Status changes are separate events
// from notes and photos — intentional: an upload failure must not suppress the
// status-change record (and vice versa).
export type JobItemEventType = "status_change" | "note" | "photo";
export const JOB_ITEM_EVENT_TYPES: readonly JobItemEventType[] = [
  "status_change",
  "note",
  "photo",
] as const;

// Which home table an event's `item_id` points at ('piece' added in slice 4).
export type ItemKind = "job_item" | "piece";
export const ITEM_KINDS: readonly ItemKind[] = ["job_item", "piece"] as const;

// An append-only event row (status change / note / photo). Produced by the
// adapter at read time; the DB row shape lives in eventRowMap.ts.
export type JobItemEvent = {
  id: string;
  jobId: string;
  itemKind: ItemKind;
  itemId: string;
  eventType: JobItemEventType;
  /** Non-null only for status_change events. */
  toStatus: JobItemStatus | null;
  /** Non-null for note and photo events that include a text note. */
  note: string | null;
  /** Non-null for photo events; a Storage path under the `job-progress` bucket. */
  photoPath: string | null;
  visibility: Visibility;
  workerId: string | null;
  createdAt: string;
};

// ─── Unified read-layer model ─────────────────────────────────────────────────

// Which home table a TrackableItem came from.
export type TrackableItemKind = "job_item" | "piece";

// The unified read-layer model for progress math and the live board. Produced
// by adapter.ts at read time — never stored. Each physical home table (job_items
// or Drawings pieces) maps into this shape with a normalised `done` flag.
export type TrackableItem = {
  id: string;
  jobId: string;
  phase: Phase;
  label: string;
  /** Normalised done: the only flag progress.ts needs. kind-specific rule:
   *  job_item = status 'done'; piece = terminal Drawings status (slice 4). */
  done: boolean;
  /** Which home table this came from (discriminant for slice 4). */
  kind: TrackableItemKind;
  sortOrder: number;
};
