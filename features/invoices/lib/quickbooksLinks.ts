/**
 * Central QuickBooks Online link mapping (QBO S2, issue #148).
 *
 * Per ADR 0010 (reaffirmed by ADR 0021): when the QBO sync lands, ONE central
 * `quickbooks_links` table maps a local entity → its QBO id, instead of
 * scattering `qbo_*_id` columns across every table. This module holds the pure,
 * I/O-free shapes + row<->object mappings (round-trip testable); the
 * service-role data access lives in `quickbooksLinksServer.ts`.
 *
 * A "link" is the tuple (realm_id, local_type, local_id) → (qbo_type, qbo_id):
 * "in QuickBooks company <realm>, our <local_type> #<local_id> IS QBO
 * <qbo_type> #<qbo_id>". The unique key is (realm_id, local_type, local_id) — a
 * local entity maps to exactly one QBO object per connected company.
 */

/**
 * The local entity kinds we map to QBO. Open string union — these are the known
 * ones (mirroring the ADR 0010 mapping table), but the column is plain text so
 * future kinds need no migration.
 */
export type QboLocalType =
  "invoice" | "vendor" | "job" | "estimate" | "customer" | "item" | "phase" | "worker";

/** Domain object form of a `quickbooks_links` row. */
export type QuickbooksLink = {
  id: string;
  /** Which local entity kind (e.g. "invoice", "vendor"). */
  localType: string;
  /** The local entity's id (TEXT — local PKs vary: jobs.id is text, others uuid). */
  localId: string;
  /** The QBO object kind (e.g. "Bill", "Vendor", "Customer", "Item"). */
  qboType: string;
  /** The QBO object id (VendorRef.value, Bill.Id, …). */
  qboId: string;
  /** Which QuickBooks company (realm) this link belongs to. */
  realmId: string;
  /** Intuit environment the id lives in ("sandbox" | "production"). */
  environment: string | null;
  /** Last time this mapping was confirmed against QBO (null until first sync). */
  syncedAt: string | null;
};

/** Raw `quickbooks_links` row as returned by supabase-js (snake_case). */
export type QuickbooksLinkRow = {
  id: string;
  local_type: string;
  local_id: string;
  qbo_type: string;
  qbo_id: string;
  realm_id: string;
  environment: string | null;
  synced_at: string | null;
};

/** Fields needed to create/replace a link (no generated columns). */
export type QuickbooksLinkInput = {
  localType: string;
  localId: string;
  qboType: string;
  qboId: string;
  realmId: string;
  environment?: string | null;
  syncedAt?: string | null;
};

/** Insertable row (snake_case) for supabase-js `.upsert()` / `.insert()`. */
export type QuickbooksLinkInsert = {
  local_type: string;
  local_id: string;
  qbo_type: string;
  qbo_id: string;
  realm_id: string;
  environment: string | null;
  synced_at: string | null;
};

/** Row → domain object. */
export function rowToLink(row: QuickbooksLinkRow): QuickbooksLink {
  return {
    id: row.id,
    localType: row.local_type,
    localId: row.local_id,
    qboType: row.qbo_type,
    qboId: row.qbo_id,
    realmId: row.realm_id,
    environment: row.environment ?? null,
    syncedAt: row.synced_at ?? null,
  };
}

/** Domain object → row (round-trips with {@link rowToLink}). */
export function linkToRow(link: QuickbooksLink): QuickbooksLinkRow {
  return {
    id: link.id,
    local_type: link.localType,
    local_id: link.localId,
    qbo_type: link.qboType,
    qbo_id: link.qboId,
    realm_id: link.realmId,
    environment: link.environment ?? null,
    synced_at: link.syncedAt ?? null,
  };
}

/** Create/replace input → insertable row. */
export function linkToInsert(input: QuickbooksLinkInput): QuickbooksLinkInsert {
  return {
    local_type: input.localType,
    local_id: input.localId,
    qbo_type: input.qboType,
    qbo_id: input.qboId,
    realm_id: input.realmId,
    environment: input.environment ?? null,
    synced_at: input.syncedAt ?? null,
  };
}

/**
 * Resolve the QBO VendorRef for an invoice, preferring the CENTRAL
 * `quickbooks_links` mapping over the legacy embedded `invoices.qbo_vendor_id`
 * column (slice 8, issue #53).
 *
 * Migration path (ADR 0021): the central table is now the source of truth. The
 * slice-8 column is kept additively for back-compat / manual fallback, but a
 * present central link always wins. Returns null when neither is set.
 */
export function resolveVendorRef(
  centralLink: string | null | undefined,
  legacyEmbedded: string | null | undefined
): string | null {
  if (centralLink != null && centralLink !== "") return centralLink;
  return legacyEmbedded ?? null;
}
