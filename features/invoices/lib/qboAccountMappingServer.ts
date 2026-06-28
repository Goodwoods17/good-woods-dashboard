/**
 * Server-only I/O for QBO S4 account + tax-code mapping (issue #150).
 *
 * Ties three pieces together: the QBO Accounting API (Account + TaxCode query),
 * the central `quickbooks_links` store (the persisted mappings, ADR 0021), and
 * the pure `qboAccountMapping` brain (parse / suggest / detect-unmapped).
 *
 * Every entry point degrades gracefully when QBO is unconfigured or the token is
 * missing — mirrors `qboVendorSyncServer.ts` (S3). SERVICE-ROLE only; never
 * import from a client component.
 */
import { qboApiBaseUrl, type QboEnvironment } from "./qboOAuth";
import {
  parseQboAccountList,
  parseQboTaxCodeList,
  suggestTaxCode,
  detectUnmappedMappings,
  LOCAL_TAX_TYPES,
  type QboAccount,
  type QboTaxCode,
  type LocalTaxType,
  type UnmappedState,
} from "./qboAccountMapping";
import { getFreshAccessToken } from "./qboConnectionServer";
import { upsertQuickbooksLink, listQuickbooksLinks } from "./quickbooksLinksServer";

/** `quickbooks_links.local_type` values this slice owns. */
export const ACCOUNT_LOCAL_TYPE = "account";
export const TAXCODE_LOCAL_TYPE = "taxcode";
/**
 * QBO **TaxRate** ids (issue #186) — DISTINCT from TAXCODE_LOCAL_TYPE. Feeds a
 * manual TxnTaxDetail TaxLine's TaxRateRef; a TaxCode id must never be used
 * there. Same `quickbooks_links` table, additive — no migration.
 */
export const TAXRATE_LOCAL_TYPE = "taxrate";

// ---------------------------------------------------------------------------
// QBO API helpers
// ---------------------------------------------------------------------------

async function qboQuery(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  query: string
): Promise<unknown> {
  const base = qboApiBaseUrl(environment);
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`QBO query failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Fetch every Account from the connected QBO company. */
export async function listQboAccounts(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment
): Promise<QboAccount[]> {
  const body = await qboQuery(
    accessToken,
    realmId,
    environment,
    "SELECT * FROM Account MAXRESULTS 1000"
  );
  return parseQboAccountList(body);
}

/** Fetch every TaxCode from the connected QBO company (per-company ids). */
export async function listQboTaxCodes(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment
): Promise<QboTaxCode[]> {
  const body = await qboQuery(
    accessToken,
    realmId,
    environment,
    "SELECT * FROM TaxCode MAXRESULTS 1000"
  );
  return parseQboTaxCodeList(body);
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** One auto-suggested GST/PST → TaxCode pairing for the wizard. */
export type TaxSuggestion = {
  localType: LocalTaxType;
  /** Suggested QBO TaxCode.Id, or null when nothing matched by name. */
  suggestedQboId: string | null;
  /** Suggested QBO TaxCode.Name (display), or null. */
  suggestedQboName: string | null;
  /** The currently-persisted mapping, if any (overrides the suggestion). */
  mappedQboId: string | null;
};

/** Everything the mapping settings panel + the gate need in one payload. */
export type MappingState = {
  status: "ok";
  accounts: QboAccount[];
  taxCodes: QboTaxCode[];
  /** Persisted account mappings: local category key → QBO Account.Id. */
  accountByLocal: Record<string, string>;
  /** Persisted tax mappings: local tax key → QBO TaxCode.Id. */
  taxByLocal: Record<string, string>;
  /** Auto-suggested GST/PST pairings (one per LOCAL_TAX_TYPES entry). */
  taxSuggestions: TaxSuggestion[];
  /** Unmapped-state signal for the (future) block-until-mapped gate. */
  unmapped: UnmappedState;
};

type MappingError = {
  status: "not_connected" | "unconfigured" | "qbo_error";
  message?: string;
};

export type MappingStateResult = MappingState | MappingError;

// ---------------------------------------------------------------------------
// Read the full mapping state
// ---------------------------------------------------------------------------

/**
 * Load the connected company's accounts + tax codes, the persisted mappings, the
 * GST/PST auto-suggestions, and the unmapped-state signal.
 *
 * `requiredAccountKeys` — the local category/cost-code keys a pending sync would
 * touch (so the gate knows exactly which accounts must be mapped). Tax keys are
 * always the two atomic Canadian taxes (GST, PST).
 */
export async function getMappingState(
  requiredAccountKeys: string[] = []
): Promise<MappingStateResult> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return {
      status: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected",
    };
  }
  const { accessToken, realmId, environment } = tokenResult;

  let accounts: QboAccount[];
  let taxCodes: QboTaxCode[];
  try {
    [accounts, taxCodes] = await Promise.all([
      listQboAccounts(accessToken, realmId, environment),
      listQboTaxCodes(accessToken, realmId, environment),
    ]);
  } catch (e) {
    return { status: "qbo_error", message: e instanceof Error ? e.message : String(e) };
  }

  const accountLinks = await listQuickbooksLinks({
    realmId,
    localType: ACCOUNT_LOCAL_TYPE,
  });
  const taxLinks = await listQuickbooksLinks({ realmId, localType: TAXCODE_LOCAL_TYPE });

  const accountByLocal: Record<string, string> = {};
  for (const link of accountLinks) accountByLocal[link.localId] = link.qboId;

  const taxByLocal: Record<string, string> = {};
  for (const link of taxLinks) taxByLocal[link.localId] = link.qboId;

  const taxSuggestions: TaxSuggestion[] = LOCAL_TAX_TYPES.map((localType) => {
    const suggestion = suggestTaxCode(localType, taxCodes);
    return {
      localType,
      suggestedQboId: suggestion?.id ?? null,
      suggestedQboName: suggestion?.name ?? null,
      mappedQboId: taxByLocal[localType] ?? null,
    };
  });

  const unmapped = detectUnmappedMappings({
    requiredAccountKeys,
    requiredTaxKeys: [...LOCAL_TAX_TYPES],
    accountByLocal,
    taxByLocal,
  });

  return {
    status: "ok",
    accounts,
    taxCodes,
    accountByLocal,
    taxByLocal,
    taxSuggestions,
    unmapped,
  };
}

/**
 * Load JUST the persisted account + tax lookups for a company from
 * `quickbooks_links` — no QBO API calls. This is what the S7 push path needs to
 * resolve a bill's AccountRefs/TaxCodeRefs and run the block-until-mapped gate
 * without round-tripping the (slow) Account/TaxCode queries.
 */
export async function loadMappingLookups(realmId: string): Promise<{
  accountByLocal: Record<string, string>;
  taxByLocal: Record<string, string>;
  taxRateByLocal: Record<string, string>;
}> {
  const [accountLinks, taxLinks, taxRateLinks] = await Promise.all([
    listQuickbooksLinks({ realmId, localType: ACCOUNT_LOCAL_TYPE }),
    listQuickbooksLinks({ realmId, localType: TAXCODE_LOCAL_TYPE }),
    listQuickbooksLinks({ realmId, localType: TAXRATE_LOCAL_TYPE }),
  ]);
  const accountByLocal: Record<string, string> = {};
  for (const link of accountLinks) accountByLocal[link.localId] = link.qboId;
  const taxByLocal: Record<string, string> = {};
  for (const link of taxLinks) taxByLocal[link.localId] = link.qboId;
  const taxRateByLocal: Record<string, string> = {};
  for (const link of taxRateLinks) taxRateByLocal[link.localId] = link.qboId;
  return { accountByLocal, taxByLocal, taxRateByLocal };
}

// ---------------------------------------------------------------------------
// Persist one mapping
// ---------------------------------------------------------------------------

export type SaveMappingResult =
  | { status: "saved"; localType: string; localId: string; qboId: string }
  | { status: "not_connected" | "unconfigured" | "invalid"; message?: string };

/**
 * Persist a single account or tax-code mapping into `quickbooks_links`.
 *
 * `kind` selects the local_type ("account" | "taxcode"); `localId` is the local
 * category/cost-code key or tax key ("GST"/"PST"/"GST_PST"); `qboId` is the
 * chosen QBO Account.Id / TaxCode.Id. Upserts on (realm, local_type, local_id).
 */
export async function saveMapping(params: {
  kind: "account" | "taxcode";
  localId: string;
  qboId: string;
}): Promise<SaveMappingResult> {
  if (!params.localId || !params.qboId) {
    return { status: "invalid", message: "localId and qboId are required" };
  }

  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return {
      status: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected",
    };
  }
  const { realmId, environment } = tokenResult;

  const localType = params.kind === "account" ? ACCOUNT_LOCAL_TYPE : TAXCODE_LOCAL_TYPE;
  const qboType = params.kind === "account" ? "Account" : "TaxCode";

  const result = await upsertQuickbooksLink({
    localType,
    localId: params.localId,
    qboType,
    qboId: params.qboId,
    realmId,
    environment,
    syncedAt: new Date().toISOString(),
  });

  if (!result.ok) return { status: "unconfigured" };
  return { status: "saved", localType, localId: params.localId, qboId: params.qboId };
}
