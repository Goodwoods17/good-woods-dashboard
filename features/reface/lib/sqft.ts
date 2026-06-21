/**
 * Square-footage rollups for Reface projects.
 *
 * Exact door-sizer formula: one element's sqft = widthIn * heightIn * qty / 144
 * (calcSqft in door-sizer.html). Elements with a missing dimension contribute 0.
 * Rollups span every photo in the project, grouped per {@link ElementKind}.
 */
import { ELEMENT_KINDS, type ElementKind, type RefaceElement, type RefaceProject } from "./types";

/** Sqft for a single element. Returns 0 if width or height is unset. */
export function elementSqft(el: Pick<RefaceElement, "widthIn" | "heightIn" | "qty">): number {
  if (el.widthIn === null || el.heightIn === null) return 0;
  const qty = el.qty > 0 ? el.qty : 1;
  return (el.widthIn * el.heightIn * qty) / 144;
}

export type KindRollup = {
  /** Number of elements (rows) of this kind. */
  rows: number;
  /** Sum of qty across those rows (physical piece count). */
  count: number;
  /** Total square footage. */
  sqft: number;
};

export type SqftSummary = {
  byKind: Record<ElementKind, KindRollup>;
  totalCount: number;
  totalSqft: number;
};

function emptyRollup(): KindRollup {
  return { rows: 0, count: 0, sqft: 0 };
}

/** Flatten every element across every photo of a project. */
export function allElements(project: RefaceProject): RefaceElement[] {
  return project.photos.flatMap((p) => p.elements);
}

/** Roll up counts + sqft per kind and overall for a whole project. */
export function summarizeProject(project: RefaceProject): SqftSummary {
  const byKind = Object.fromEntries(ELEMENT_KINDS.map((k) => [k, emptyRollup()])) as Record<
    ElementKind,
    KindRollup
  >;

  let totalCount = 0;
  let totalSqft = 0;

  for (const el of allElements(project)) {
    const qty = el.qty > 0 ? el.qty : 1;
    const sqft = elementSqft(el);
    const bucket = byKind[el.kind];
    bucket.rows += 1;
    bucket.count += qty;
    bucket.sqft += sqft;
    totalCount += qty;
    totalSqft += sqft;
  }

  return { byKind, totalCount, totalSqft };
}
