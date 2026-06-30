import type { ProjectDocument } from "@shared/lib/types";

/**
 * Pure, environment-free rules for the job's canonical current spec — the set
 * of documents the team considers "in effect" for this job. Unlike the
 * `selectClientSafeDocuments` exposure filter (S2, ADR 0022), this set is
 * staff-facing and places NO restrictions on kind or source: a toolpath_cnc or
 * a Drive-link can be part of the current spec. `is_current` is the sole gate.
 *
 * The S2 share logic builds on this set: `selectClientSafeDocuments` already
 * filters `is_current === true` plus the kind/source exposure rules, so any
 * doc promoted to the current spec automatically becomes the default share
 * payload candidate for eligible documents.
 */

/** A document belongs to the canonical current spec iff its `is_current` flag is set. */
export function isCurrentSpecDocument(doc: ProjectDocument): boolean {
  return doc.isCurrent === true;
}

/**
 * The job's canonical current spec — every document where `is_current` is set,
 * preserving order. Includes all kinds and sources (staff-facing).
 */
export function selectCurrentSpecDocuments(docs: ProjectDocument[]): ProjectDocument[] {
  return docs.filter(isCurrentSpecDocument);
}
