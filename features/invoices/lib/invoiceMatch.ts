/**
 * Pure matching helpers for Slice 4 — supplier auto-detect + job suggestion.
 * No Supabase, no React. All inputs come from the caller so these are
 * trivially testable and swappable if the matching strategy changes later.
 */
import type { CatalogSupplier } from "@features/catalog/lib/catalogRowMap";
import type { Job } from "@shared/lib/types";

// ---------------------------------------------------------------------------
// Supplier auto-detect
// ---------------------------------------------------------------------------

/** Confidence levels for the supplier match, best-first. */
export type SupplierMatchKind = "exact" | "partial" | "none";

export type SupplierDetectResult = {
  /** The best-matched supplier, or null when nothing was found. */
  supplier: CatalogSupplier | null;
  matchKind: SupplierMatchKind;
};

/**
 * Auto-detect a catalog supplier from the free-text `supplierText` extracted
 * from the invoice header.
 *
 * Strategy (best-first):
 * 1. Exact  — trimmed, case-insensitive equality with a catalog name.
 * 2. Partial — one string contains the other (invoice text ⊃ catalog name, or
 *              catalog name ⊃ invoice text).  Good for trailing "Ltd" / "Inc"
 *              mismatches common in scanned invoices.
 * 3. None   — no candidate survives the partial check.
 */
export function detectSupplier(
  supplierText: string | null,
  suppliers: CatalogSupplier[]
): SupplierDetectResult {
  const none: SupplierDetectResult = { supplier: null, matchKind: "none" };
  if (!supplierText?.trim() || suppliers.length === 0) return none;

  const text = supplierText.trim().toLowerCase();

  // 1. Exact (case-insensitive).
  const exact = suppliers.find((s) => s.name.trim().toLowerCase() === text);
  if (exact) return { supplier: exact, matchKind: "exact" };

  // 2. Partial — one name substring-contains the other.
  const partial = suppliers.find((s) => {
    const sName = s.name.trim().toLowerCase();
    return sName.includes(text) || text.includes(sName);
  });
  if (partial) return { supplier: partial, matchKind: "partial" };

  return none;
}

// ---------------------------------------------------------------------------
// Job suggestion from PO / order reference
// ---------------------------------------------------------------------------

/**
 * Suggest a job from the invoice's PO / order ref field by looking for a
 * job code embedded in the string.  Returns the first job whose `code`
 * (case-insensitive) appears anywhere in `poRef`, or null when there is no
 * match (empty ref, whitespace, or no code found).
 */
export function suggestJob(poRef: string | null, jobs: Job[]): Job | null {
  if (!poRef?.trim() || jobs.length === 0) return null;
  const text = poRef.trim().toLowerCase();
  return jobs.find((j) => text.includes(j.code.toLowerCase())) ?? null;
}
