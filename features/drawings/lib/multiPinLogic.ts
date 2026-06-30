import type { JobPiecePin, PinRole } from "@shared/lib/types";

/** True if the given piece already has any pin on the given document. */
export function isPinnedOnDocument(
  pins: JobPiecePin[],
  pieceId: string,
  documentId: string
): boolean {
  return pins.some((p) => p.jobPieceId === pieceId && p.documentId === documentId);
}

export type PinPatch = { id: string; patch: Partial<JobPiecePin> };

/**
 * Returns the minimal set of patches needed to promote `pinId` to primary for
 * its piece. Every sibling pin for the same piece receives `isPrimary: false`
 * and the target receives `isPrimary: true`. Returns an empty array when the
 * target is already primary or is not found.
 */
export function buildSetPrimaryPatches(
  pins: JobPiecePin[],
  pinId: string
): PinPatch[] {
  const target = pins.find((p) => p.id === pinId);
  if (!target || target.isPrimary) return [];
  return pins
    .filter((p) => p.jobPieceId === target.jobPieceId)
    .map((p) => ({ id: p.id, patch: { isPrimary: p.id === pinId } }));
}

export const PIN_ROLE_LABELS: Record<PinRole, string> = {
  plan: "Plan",
  elevation: "Elevation",
  section: "Section",
  detail: "Detail",
  other: "Other",
};

export const PIN_ROLES: PinRole[] = ["plan", "elevation", "section", "detail", "other"];
