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
