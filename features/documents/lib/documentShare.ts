import { CLIENT_SAFE_KINDS, type ProjectDocument } from "@shared/lib/types";

/**
 * Pure, environment-free exposure rules for the no-login document view portal
 * (S2, ADR 0022 · milestone #12). These mirror EXACTLY the server-side curated-set
 * query in `documentShareServer.ts` (`.in("kind", CLIENT_SAFE_KINDS)` +
 * `.neq("source","link")` + `.eq("is_current", true)`) so the same allow-list is
 * enforced in Postgres AND previewed in the mint UI — the server query is the
 * security boundary; this module keeps the client honest about what will leave
 * the shop. Kept pure so it is unit-testable without a DB or a browser.
 */

/**
 * A document may leave the shop on a `document_view` link only when it is the
 * CURRENT revision, an UPLOADED file (a Drive link can't guarantee no-login
 * access), and of a CLIENT-SAFE kind (`toolpath_cnc` + `other` are excluded).
 */
export function isClientSafeDocument(doc: ProjectDocument): boolean {
  return doc.isCurrent === true && doc.source !== "link" && CLIENT_SAFE_KINDS.includes(doc.kind);
}

/** The curated set: every document that passes every exposure rule. */
export function selectClientSafeDocuments(docs: ProjectDocument[]): ProjectDocument[] {
  return docs.filter(isClientSafeDocument);
}

/**
 * The mint-time warning count: documents that WOULD be shared (current,
 * client-safe kind) but are held back ONLY because they are Drive links. Staff
 * see this so they know a Drive doc won't appear on the no-login portal.
 */
export function countExcludedDriveLinks(docs: ProjectDocument[]): number {
  return docs.filter(
    (d) => d.source === "link" && d.isCurrent === true && CLIENT_SAFE_KINDS.includes(d.kind)
  ).length;
}

export type SupersededInfo = {
  superseded: boolean;
  /** The version label of the live current revision, when one is known. */
  currentVersion: string | null;
};

/**
 * Whether the anchored document has been superseded since the link was minted,
 * and (when found) the version of the current revision of the same kind — drives
 * the "SUPERSEDED → current is Rev X" banner on the portal.
 */
export function computeSuperseded(
  anchor: ProjectDocument,
  siblings: ProjectDocument[]
): SupersededInfo {
  if (anchor.isCurrent) return { superseded: false, currentVersion: null };
  const current = siblings.find((d) => d.isCurrent && d.kind === anchor.kind && d.id !== anchor.id);
  return { superseded: true, currentVersion: current?.version ?? null };
}
