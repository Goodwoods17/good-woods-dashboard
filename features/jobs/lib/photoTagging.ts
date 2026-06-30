/**
 * Pure helpers for install-photo milestone tagging (S10).
 *
 * Photos stored in `job-documents` with `kind:photo` carry a structured JSON
 * payload in their `notes` field. Everything else (free-text notes on other
 * kinds) passes through untouched because `parsePhotoTag` returns null when the
 * JSON is absent or doesn't match the expected shape.
 */
import type { MilestoneStage } from "@shared/lib/types";

export type PhotoPosition = "before" | "after";

export type PhotoIssue = {
  id: string;
  /** Normalized coordinates (0..1) relative to the displayed image. */
  box: { x: number; y: number; w: number; h: number };
  note: string;
};

/** Structured metadata embedded in `ProjectDocument.notes` for photo docs. */
export type PhotoTag = {
  milestone: MilestoneStage;
  position: PhotoPosition;
  issues: PhotoIssue[];
};

const VALID_POSITIONS: ReadonlySet<string> = new Set<PhotoPosition>(["before", "after"]);
const VALID_MILESTONES: ReadonlySet<string> = new Set<MilestoneStage>([
  "design",
  "cnc",
  "assembly",
  "finishing",
  "delivery",
  "install",
]);

/**
 * Parse a photo tag from the `notes` field of a `ProjectDocument`.
 * Returns `null` if the field is absent, not valid JSON, or not a tag object —
 * so free-text notes on non-photo docs are never misread.
 */
export function parsePhotoTag(notes: string | null | undefined): PhotoTag | null {
  if (!notes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(notes);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("milestone" in parsed) ||
    !("position" in parsed)
  ) {
    return null;
  }
  const raw = parsed as Record<string, unknown>;
  if (
    typeof raw.milestone !== "string" ||
    !VALID_MILESTONES.has(raw.milestone) ||
    typeof raw.position !== "string" ||
    !VALID_POSITIONS.has(raw.position)
  ) {
    return null;
  }
  return {
    milestone: raw.milestone as MilestoneStage,
    position: raw.position as PhotoPosition,
    issues: Array.isArray(raw.issues) ? (raw.issues as PhotoIssue[]) : [],
  };
}

/** Serialize a `PhotoTag` back to the `notes` string for persistence. */
export function serializePhotoTag(tag: PhotoTag): string {
  return JSON.stringify(tag);
}

/** Build a new issue with a fresh UUID. */
export function newPhotoIssue(
  box: PhotoIssue["box"],
  note = ""
): PhotoIssue {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `issue_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  return { id, box, note };
}

/** Merge (add or update) an issue into a tag, returning a new tag. */
export function upsertIssue(tag: PhotoTag, issue: PhotoIssue): PhotoTag {
  const existing = tag.issues.findIndex((i) => i.id === issue.id);
  const next =
    existing >= 0
      ? tag.issues.map((i) => (i.id === issue.id ? issue : i))
      : [...tag.issues, issue];
  return { ...tag, issues: next };
}

/** Remove an issue by id from a tag, returning a new tag. */
export function removeIssue(tag: PhotoTag, issueId: string): PhotoTag {
  return { ...tag, issues: tag.issues.filter((i) => i.id !== issueId) };
}
