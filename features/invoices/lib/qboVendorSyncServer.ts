/**
 * Server-only I/O for QBO S3 vendor mapping (issue #149).
 *
 * Ties together three pieces: the QBO Accounting API (vendor query + create),
 * the local `catalog_suppliers` table, and the central `quickbooks_links` store.
 *
 * Every entry point degrades gracefully when QBO is unconfigured or the service
 * client is absent — mirrors the pattern established in `qboConnectionServer.ts`
 * and `quickbooksLinksServer.ts`. SERVER-ROLE only; never import from a client
 * component.
 */
import { qboApiBaseUrl, type QboEnvironment } from "./qboOAuth";
import {
  parseQboVendorList,
  parseQboCreatedVendor,
  matchVendors,
  type QboVendor,
} from "./qboVendorSync";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { SUPPLIERS_TABLE } from "@features/catalog/lib/catalogRowMap";
import { upsertQuickbooksLink, getQuickbooksLink } from "./quickbooksLinksServer";
import { getFreshAccessToken } from "./qboConnectionServer";

// ---------------------------------------------------------------------------
// QBO API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch every active (and inactive) Vendor from the connected QBO company.
 * Uses the QBO Accounting v3 query endpoint (`SELECT * FROM Vendor MAXRESULTS 500`).
 * Throws on a non-2xx response so the caller can surface a typed error.
 */
export async function listQboVendors(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment
): Promise<QboVendor[]> {
  const base = qboApiBaseUrl(environment);
  const url = `${base}/v3/company/${realmId}/query?query=SELECT%20*%20FROM%20Vendor%20MAXRESULTS%20500&minorversion=65`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`QBO vendor query failed: ${res.status} ${res.statusText}`);
  }
  return parseQboVendorList(await res.json());
}

/**
 * Create a new Vendor in the connected QBO company with the given `displayName`.
 * QBO requires DisplayName to be unique — callers should only call this after
 * confirming no match exists. Throws on a non-2xx response.
 */
export async function createQboVendor(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  displayName: string
): Promise<QboVendor> {
  const base = qboApiBaseUrl(environment);
  const url = `${base}/v3/company/${realmId}/vendor?minorversion=65`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ DisplayName: displayName }),
  });
  if (!res.ok) {
    throw new Error(`QBO vendor create failed: ${res.status} ${res.statusText}`);
  }
  const vendor = parseQboCreatedVendor(await res.json());
  if (!vendor) {
    throw new Error("QBO vendor create returned no Vendor in body");
  }
  return vendor;
}

// ---------------------------------------------------------------------------
// Resolve result types
// ---------------------------------------------------------------------------

/** A supplier was successfully mapped to a QBO Vendor id. */
type MappedResult = {
  status: "mapped";
  /** QBO Vendor.Id (the value that goes in VendorRef.value on a Bill). */
  qboId: string;
  /** QBO Vendor.DisplayName for display; empty when reusing a cached mapping. */
  qboVendorName: string;
  /** True when we created a new Vendor in QBO (vs. matched an existing one). */
  created: boolean;
};

/** Multiple plausible QBO vendors were found; the owner needs to pick one. */
type AmbiguousResult = {
  status: "ambiguous";
  candidates: QboVendor[];
};

type ErrorResult = {
  status: "not_connected" | "unconfigured" | "supplier_not_found" | "qbo_error";
  message?: string;
};

export type VendorResolveResult = MappedResult | AmbiguousResult | ErrorResult;

// ---------------------------------------------------------------------------
// Main resolve entry point
// ---------------------------------------------------------------------------

/**
 * Resolve a local `catalog_suppliers` row to a QBO Vendor id, persisting the
 * mapping in `quickbooks_links` on success.
 *
 * Flow:
 * 1. Get a fresh QBO access token (or return unconfigured/not_connected).
 * 2. Load the supplier name from `catalog_suppliers`.
 * 3. If `qboVendorId` is provided (owner resolved ambiguity), use it directly
 *    and skip matching.
 * 4. Check `quickbooks_links` for an existing mapping — return it without a
 *    live QBO call if present (and `qboVendorId` is not overriding).
 * 5. List QBO vendors and run name matching.
 * 6. Exact match → persist link, return.
 *    Ambiguous → return candidates for the owner to pick.
 *    None → create a new QBO Vendor → persist link, return.
 */
export async function resolveSupplierVendor(params: {
  supplierId: string;
  /**
   * Set when the owner has already chosen from an `ambiguous` candidate list.
   * Skips the matching step and stores the chosen id directly.
   */
  qboVendorId?: string | null;
}): Promise<VendorResolveResult> {
  // 1. Fresh access token.
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return {
      status: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected",
    };
  }
  const { accessToken, realmId, environment } = tokenResult;

  // 2. Load the supplier.
  const sb = getServiceRoleClient();
  if (!sb) return { status: "unconfigured" };

  const { data: sup } = await sb
    .from(SUPPLIERS_TABLE)
    .select("id, name")
    .eq("id", params.supplierId)
    .maybeSingle();
  if (!sup) return { status: "supplier_not_found" };

  const supplierName = (sup as { id: string; name: string }).name;

  // 3. Owner has chosen a specific QBO vendor (resolving a prior ambiguous result).
  if (params.qboVendorId) {
    await upsertQuickbooksLink({
      localType: "vendor",
      localId: params.supplierId,
      qboType: "Vendor",
      qboId: params.qboVendorId,
      realmId,
      environment,
      syncedAt: new Date().toISOString(),
    });
    // Fetch vendors so we can return the display name for the UI.
    try {
      const vendors = await listQboVendors(accessToken, realmId, environment);
      const chosen = vendors.find((v) => v.id === params.qboVendorId);
      return {
        status: "mapped",
        qboId: params.qboVendorId,
        qboVendorName: chosen?.displayName ?? "",
        created: false,
      };
    } catch {
      // Non-fatal — we already persisted the link; display name is optional.
      return { status: "mapped", qboId: params.qboVendorId, qboVendorName: "", created: false };
    }
  }

  // 4. Check for an existing mapping (cache hit — skip live QBO query).
  const existing = await getQuickbooksLink({
    realmId,
    localType: "vendor",
    localId: params.supplierId,
  });
  if (existing) {
    // Refresh synced_at so consumers know this was confirmed recently.
    await upsertQuickbooksLink({
      localType: "vendor",
      localId: params.supplierId,
      qboType: "Vendor",
      qboId: existing.qboId,
      realmId,
      environment,
      syncedAt: new Date().toISOString(),
    });
    return { status: "mapped", qboId: existing.qboId, qboVendorName: "", created: false };
  }

  // 5. List vendors + match by name.
  let vendors: QboVendor[];
  try {
    vendors = await listQboVendors(accessToken, realmId, environment);
  } catch (e) {
    return {
      status: "qbo_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const match = matchVendors(supplierName, vendors);

  if (match.kind === "exact") {
    await upsertQuickbooksLink({
      localType: "vendor",
      localId: params.supplierId,
      qboType: "Vendor",
      qboId: match.vendor.id,
      realmId,
      environment,
      syncedAt: new Date().toISOString(),
    });
    return {
      status: "mapped",
      qboId: match.vendor.id,
      qboVendorName: match.vendor.displayName,
      created: false,
    };
  }

  if (match.kind === "ambiguous") {
    return { status: "ambiguous", candidates: match.candidates };
  }

  // 6. No match → create a new Vendor in QBO.
  let created: QboVendor;
  try {
    created = await createQboVendor(accessToken, realmId, environment, supplierName);
  } catch (e) {
    return {
      status: "qbo_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  await upsertQuickbooksLink({
    localType: "vendor",
    localId: params.supplierId,
    qboType: "Vendor",
    qboId: created.id,
    realmId,
    environment,
    syncedAt: new Date().toISOString(),
  });
  return {
    status: "mapped",
    qboId: created.id,
    qboVendorName: created.displayName,
    created: true,
  };
}
