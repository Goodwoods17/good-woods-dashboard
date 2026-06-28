/**
 * Pure, I/O-free helpers for QBO S4 account + tax-code mapping (issue #150).
 *
 * Two things must be mapped before a posted invoice can become a QBO Bill:
 *   1. Each local cost-code/category → a QBO expense **AccountRef**.
 *   2. The Canadian sales taxes (GST, PST) → the connected company's QBO
 *      **TaxCodeRef** ids — which are PER-COMPANY (Intuit assigns them per
 *      file), so they can only be discovered by querying the company and
 *      matched by NAME.
 *
 * The mappings persist in the central `quickbooks_links` table (ADR 0021) under
 * `local_type` "account" and "taxcode"; this module is the pure brain that
 * parses the QBO query responses, auto-suggests the GST/PST codes by name,
 * resolves a bill line + its tax to (AccountRef, TaxCodeRef), and detects the
 * unmapped state that feeds the future block-until-mapped gate.
 *
 * No Supabase, no QBO API calls, no React — those live in
 * `qboAccountMappingServer.ts`.
 */

/** A QBO Account as returned by the Account query endpoint. */
export type QboAccount = {
  /** Account.Id (QBO's numeric string pk → goes in AccountRef.value). */
  id: string;
  /** Account.Name (shown in the mapping picker). */
  name: string;
  /** Account.AccountType (e.g. "Expense", "Cost of Goods Sold"). */
  accountType: string;
  /** Account.Active. Inactive accounts are still listed but flagged. */
  active: boolean;
};

/** A QBO TaxCode as returned by the TaxCode query endpoint. */
export type QboTaxCode = {
  /** TaxCode.Id (per-company → goes in a line's TaxCodeRef.value). */
  id: string;
  /** TaxCode.Name (e.g. "GST", "PST (BC)", "GST/PST BC"). */
  name: string;
  /** TaxCode.Active. */
  active: boolean;
};

/**
 * The canonical local Canadian sales-tax kinds we map to per-company QBO
 * TaxCodeRefs. Open enough for the wizard; PST/GST are the BC pair Good Woods
 * uses. Combined taxable lines use the synthetic `GST_PST` key (mapped to the
 * company's combined code) — but that is the caller's concern, not enumerated
 * here because the auto-suggest only reasons about the two atomic taxes.
 */
export type LocalTaxType = "GST" | "PST";
export const LOCAL_TAX_TYPES: LocalTaxType[] = ["GST", "PST"];

// ---------------------------------------------------------------------------
// Parsing the QBO query responses
// ---------------------------------------------------------------------------

/**
 * Parse the body of `GET /v3/company/{realmId}/query?query=SELECT * FROM Account`.
 */
export function parseQboAccountList(body: unknown): QboAccount[] {
  const resp = body as { QueryResponse?: { Account?: unknown[] } } | null;
  const raw = resp?.QueryResponse?.Account ?? [];
  return (raw as { Id?: string; Name?: string; AccountType?: string; Active?: boolean }[])
    .map((a) => ({
      id: a.Id ?? "",
      name: a.Name ?? "",
      accountType: a.AccountType ?? "",
      active: a.Active !== false,
    }))
    .filter((a) => a.id !== "");
}

/**
 * Parse the body of `GET /v3/company/{realmId}/query?query=SELECT * FROM TaxCode`.
 */
export function parseQboTaxCodeList(body: unknown): QboTaxCode[] {
  const resp = body as { QueryResponse?: { TaxCode?: unknown[] } } | null;
  const raw = resp?.QueryResponse?.TaxCode ?? [];
  return (raw as { Id?: string; Name?: string; Active?: boolean }[])
    .map((t) => ({
      id: t.Id ?? "",
      name: t.Name ?? "",
      active: t.Active !== false,
    }))
    .filter((t) => t.id !== "");
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/** Lowercase, trim, collapse internal whitespace — the only comparison used. */
export function normalizeMapName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Auto-suggest the per-company QBO TaxCode for a local tax kind by NAME.
 *
 * Ranking (active codes only): an exact normalised name match wins; otherwise
 * the first active code whose normalised name contains the abbreviation
 * ("gst"/"pst"). A combined "GST/PST BC" code therefore won't shadow the atomic
 * "GST" code (exact beats substring), but is still offered when no atomic code
 * exists. Returns null when nothing plausible matches — the owner picks manually.
 */
export function suggestTaxCode(localType: LocalTaxType, taxCodes: QboTaxCode[]): QboTaxCode | null {
  const needle = normalizeMapName(localType);
  const active = taxCodes.filter((t) => t.active !== false);

  const exact = active.find((t) => normalizeMapName(t.name) === needle);
  if (exact) return exact;

  const substring = active.find((t) => normalizeMapName(t.name).includes(needle));
  return substring ?? null;
}

// ---------------------------------------------------------------------------
// Resolving a bill line to its QBO refs
// ---------------------------------------------------------------------------

/** Input shape for one bill line's mapping resolution. */
export type BillLineMappingInput = {
  /**
   * The local cost-code/category key for this line (e.g. the invoice line's
   * `qboAccount` label or a cost-code id). Null when the line carries none —
   * which is itself an unmapped state (every Bill line needs an AccountRef).
   */
  categoryKey: string | null;
  /**
   * The local tax key for this line: "GST" | "PST" | "GST_PST" for a taxable
   * line, or null for a non-taxable line. The caller decides which key a line's
   * `taxFlag` maps to; this function only does the lookup.
   */
  taxCodeKey: string | null;
};

/** The resolved QBO refs for a bill line, plus the unmapped flags. */
export type BillLineRefs = {
  /** QBO AccountRef.value, or null when the category is unmapped. */
  accountRef: string | null;
  /** QBO line TaxCodeRef.value, or null when non-taxable or unmapped. */
  taxCodeRef: string | null;
  /** True when this line can't resolve an AccountRef (blocks the sync). */
  unmappedAccount: boolean;
  /** True when a TAXABLE line can't resolve a TaxCodeRef (blocks the sync). */
  unmappedTax: boolean;
};

/** The persisted local→QBO id lookups (built from `quickbooks_links`). */
export type MappingLookups = {
  /** local category/cost-code key → QBO Account.Id. */
  accountByLocal: Record<string, string>;
  /** local tax key ("GST" | "PST" | "GST_PST") → QBO TaxCode.Id. */
  taxByLocal: Record<string, string>;
};

/**
 * Resolve a single bill line + its tax to QBO (AccountRef, TaxCodeRef) using the
 * persisted mappings. Pure dictionary lookups + unmapped detection — this is the
 * core the sync layer and the block-until-mapped gate both call.
 */
export function resolveBillLineRefs(
  line: BillLineMappingInput,
  maps: MappingLookups
): BillLineRefs {
  const accountRef =
    line.categoryKey != null ? (maps.accountByLocal[line.categoryKey] ?? null) : null;
  const taxCodeRef = line.taxCodeKey != null ? (maps.taxByLocal[line.taxCodeKey] ?? null) : null;

  return {
    accountRef,
    taxCodeRef,
    // Every Bill line MUST resolve an account; a missing category counts.
    unmappedAccount: accountRef == null,
    // Only a taxable line (non-null key) that fails to resolve is "unmapped".
    unmappedTax: line.taxCodeKey != null && taxCodeRef == null,
  };
}

// ---------------------------------------------------------------------------
// The block-until-mapped gate signal
// ---------------------------------------------------------------------------

/** The overall mapping completeness for a set of required keys. */
export type UnmappedState = {
  /** Required account/category keys with no QBO link (preserves input order). */
  unmappedAccounts: string[];
  /** Required tax keys with no QBO link. */
  unmappedTaxes: string[];
  /** True only when nothing is unmapped — the gate is open. */
  fullyMapped: boolean;
};

/**
 * Detect the unmapped state across the full set of keys a sync would touch.
 * This is the signal the future block-until-mapped gate consumes: while any
 * required account or tax key lacks a QBO link, the gate stays shut.
 *
 * Blank keys are ignored and duplicates collapsed, so callers can pass the raw
 * (possibly noisy) set of keys harvested from the invoices being posted.
 */
export function detectUnmappedMappings(params: {
  requiredAccountKeys: string[];
  requiredTaxKeys: string[];
  accountByLocal: Record<string, string>;
  taxByLocal: Record<string, string>;
}): UnmappedState {
  const clean = (keys: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of keys) {
      const k = raw?.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  };

  const unmappedAccounts = clean(params.requiredAccountKeys).filter(
    (k) => !params.accountByLocal[k]
  );
  const unmappedTaxes = clean(params.requiredTaxKeys).filter((k) => !params.taxByLocal[k]);

  return {
    unmappedAccounts,
    unmappedTaxes,
    fullyMapped: unmappedAccounts.length === 0 && unmappedTaxes.length === 0,
  };
}
