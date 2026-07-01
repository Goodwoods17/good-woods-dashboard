import type { JobPiecePin, PinRole } from "@shared/lib/types";

/** True if the given piece already has any pin on the given document. */
export function isPinnedOnDocument(
  pins: JobPiecePin[],
  pieceId: string,
  documentId: string
): boolean {
  return pins.some((p) => p.jobPieceId === pieceId && p.documentId === documentId);
}

// The SINGLE page-match convention for pins (#270). A pin is created with
// `page: currentPage`, and DrawingDoc reports the current page as 0 for a SKETCH
// (single dot-grid canvas) and 1+ for an image/PDF. So a pin's page is
// authoritative; a null page (only legacy/backfilled pins) defaults to 0 — the
// first page, which is also the sole page of a sketch — so it can never be
// stranded off a sketch (the page-0 bug class this replaces: the old overlay
// filter used `?? 1`, which hid every sketch pin because 1 !== 0).
export function pinMatchesPage(pin: JobPiecePin, page: number): boolean {
  return (pin.page ?? 0) === page;
}

export type PinPatch = { id: string; patch: Partial<JobPiecePin> };

/**
 * Returns the minimal set of patches needed to promote `pinId` to primary for
 * its piece. Every sibling pin for the same piece receives `isPrimary: false`
 * and the target receives `isPrimary: true`. Returns an empty array when the
 * target is already primary or is not found.
 */
export function buildSetPrimaryPatches(pins: JobPiecePin[], pinId: string): PinPatch[] {
  const target = pins.find((p) => p.id === pinId);
  if (!target || target.isPrimary) return [];
  return pins
    .filter((p) => p.jobPieceId === target.jobPieceId)
    .map((p) => ({ id: p.id, patch: { isPrimary: p.id === pinId } }));
}

/** Comparator: primary pins sort before non-primary. */
export const byPrimaryFirst = (a: JobPiecePin, b: JobPiecePin) =>
  Number(b.isPrimary) - Number(a.isPrimary);

export const PIN_ROLE_LABELS: Record<PinRole, string> = {
  plan: "Plan",
  elevation: "Elevation",
  section: "Section",
  detail: "Detail",
  other: "Other",
};

export const PIN_ROLES: PinRole[] = ["plan", "elevation", "section", "detail", "other"];
