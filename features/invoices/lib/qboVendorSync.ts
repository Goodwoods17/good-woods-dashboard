/**
 * Pure, I/O-free helpers for QBO vendor matching (QBO S3, issue #149).
 *
 * Given a list of QBO Vendor objects and a local supplier name, these helpers
 * decide whether the supplier has an unambiguous existing QBO counterpart (→
 * auto-use), multiple plausible matches (→ surface a picker to the owner), or no
 * match at all (→ create-on-QBO, then persist via `quickbooks_links`).
 *
 * No Supabase, no QBO API calls — those live in `qboVendorSyncServer.ts`.
 * No React — safe to import from any server path.
 */

/** A QBO Vendor as returned by the Vendor query endpoint. */
export type QboVendor = {
  /** Vendor.Id (QBO's numeric string pk). */
  id: string;
  /** Vendor.DisplayName (the name shown everywhere in QBO). */
  displayName: string;
  /** Vendor.Active. Inactive vendors are excluded from matching. */
  active: boolean;
};

/** The outcome of matching a local supplier name against a list of QBO vendors. */
export type VendorMatchResult =
  | { kind: "exact"; vendor: QboVendor }
  | { kind: "ambiguous"; candidates: QboVendor[] }
  | { kind: "none" };

/**
 * Normalise a vendor name for comparison: lowercase, trim, collapse runs of
 * whitespace to a single space. This is the only comparison used — no Levenshtein
 * or phonetic matching to keep the logic predictable and auditable.
 */
export function normalizeVendorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Match a local `supplierName` against a list of QBO vendors.
 *
 * Strategy (in priority order):
 * 1. **Exact** (case-insensitive, whitespace-normalised): one active vendor
 *    whose `displayName` normalises to the same string → `{ kind: "exact" }`.
 * 2. **Ambiguous exact duplicates**: two or more exact matches (QBO shouldn't
 *    allow this but defensive) → `{ kind: "ambiguous", candidates }`.
 * 3. **Fuzzy substring**: no exact match but one or more active vendors where
 *    the normalised names contain each other → `{ kind: "ambiguous", candidates }`.
 *    We never auto-select a fuzzy match; the owner picks.
 * 4. **None**: no active vendor is even a substring match → `{ kind: "none" }`,
 *    meaning a new vendor should be created in QBO.
 *
 * Inactive vendors (Active=false) are always excluded.
 */
export function matchVendors(supplierName: string, vendors: QboVendor[]): VendorMatchResult {
  const needle = normalizeVendorName(supplierName);
  const active = vendors.filter((v) => v.active !== false);

  // Step 1 + 2: exact matches (case-insensitive).
  const exact = active.filter((v) => normalizeVendorName(v.displayName) === needle);
  if (exact.length === 1) return { kind: "exact", vendor: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  // Step 3: fuzzy — one string is a substring of the other.
  const fuzzy = active.filter((v) => {
    const n = normalizeVendorName(v.displayName);
    return n.includes(needle) || needle.includes(n);
  });
  if (fuzzy.length === 0) return { kind: "none" };
  return { kind: "ambiguous", candidates: fuzzy };
}

/**
 * Parse the body returned by the QBO Vendor query endpoint:
 * `GET /v3/company/{realmId}/query?query=SELECT * FROM Vendor`.
 */
export function parseQboVendorList(body: unknown): QboVendor[] {
  const resp = body as { QueryResponse?: { Vendor?: unknown[] } };
  const raw = resp?.QueryResponse?.Vendor ?? [];
  return (raw as { Id?: string; DisplayName?: string; Active?: boolean }[])
    .map((v) => ({
      id: v.Id ?? "",
      displayName: v.DisplayName ?? "",
      active: v.Active !== false,
    }))
    .filter((v) => v.id !== "");
}

/**
 * Parse the body returned by the QBO Vendor create endpoint:
 * `POST /v3/company/{realmId}/vendor`.
 */
export function parseQboCreatedVendor(body: unknown): QboVendor | null {
  const resp = body as { Vendor?: { Id?: string; DisplayName?: string; Active?: boolean } };
  const v = resp?.Vendor;
  if (!v?.Id) return null;
  return {
    id: v.Id,
    displayName: v.DisplayName ?? "",
    active: v.Active !== false,
  };
}
