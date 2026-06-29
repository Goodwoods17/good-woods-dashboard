import "server-only";
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
import { type QboEnvironment } from "./qboOAuth";
import { qboQuery } from "./qboClient";
import { withQboToken } from "./withQboToken";
import { QBO_LOCAL_TYPE, QBO_TYPE } from "./qboLinkTypes";
import {
  parseQboAccountList,
  parseQboTaxCodeList,
  suggestTaxCode,
  detectUnmappedMappings,
  buildAccountRequirements,
  LOCAL_TAX_TYPES,
  type QboAccount,
  type QboTaxCode,
  type LocalTaxType,
  type UnmappedState,
  type AccountRequirement,
} from "./qboAccountMapping";
import { upsertQuickbooksLink, listQuickbooksLinks } from "./quickbooksLinksServer";
import { getServiceRoleClient } from "@shared/lib/serviceClient";

/** `quickbooks_links.local_type` values this slice owns. */
export const ACCOUNT_LOCAL_TYPE = QBO_LOCAL_TYPE.account;
export const TAXCODE_LOCAL_TYPE = QBO_LOCAL_TYPE.taxcode;
/**
 * QBO **TaxRate** ids (issue #186) — DISTINCT from TAXCODE_LOCAL_TYPE. Feeds a
 * manual TxnTaxDetail TaxLine's TaxRateRef; a TaxCode id must never be used
 * there. Same `quickbooks_links` table, additive — no migration.
 */
export const TAXRATE_LOCAL_TYPE = QBO_LOCAL_TYPE.taxrate;

/** Fetch every Account from the connected QBO company. */
export async function listQboAccounts(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment
): Promise<QboAccount[]> {
  const body = await qboQuery(
    { accessToken, realmId, environment },
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
    { accessToken, realmId, environment },
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
  /**
   * The account-mapping rows the settings UI draws (QBO-H4, issue #187): one per
   * distinct local cost-code/category key a pending sync would touch, with its
   * current QBO link. This is what lets the owner clear the block-until-mapped
   * dead-end — the panel POSTs `kind:"account"` for each.
   */
  accountRequirements: AccountRequirement[];
  /** Auto-suggested GST/PST pairings (one per LOCAL_TAX_TYPES entry). */
  taxSuggestions: TaxSuggestion[];
  /** Unmapped-state signal for the block-until-mapped gate. */
  unmapped: UnmappedState;
};

type MappingError = {
  status: "not_connected" | "unconfigured" | "qbo_error";
  message?: string;
};

export type MappingStateResult = MappingState | MappingError;

// ---------------------------------------------------------------------------
// Harvest the local account keys a pending sync would touch
// ---------------------------------------------------------------------------

/**
 * The distinct local cost-code/category keys (`invoice_lines.qbo_account`) on
 * every `posted` invoice — the exact set the owner must map to QBO expense
 * accounts before those bills can sync. This is what feeds the account-mapping
 * rows (QBO-H4, issue #187) so the block-until-mapped gate can actually be
 * cleared in-UI rather than naming a count the panel can't act on.
 *
 * Posted is the eligible-to-push status (`evaluateBillPush` refuses anything
 * else); already-pushed invoices keep their `posted` status, so a few of these
 * keys may already be mapped — harmless, the row just shows "mapped". Degrades
 * to [] when the service client is unavailable (mirrors the rest of this file).
 */
export async function listRequiredAccountKeys(): Promise<string[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  const { data: posted } = await sb.from("invoices").select("id").eq("status", "posted");
  const ids = ((posted as { id: string }[] | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  const { data: lineRows } = await sb
    .from("invoice_lines")
    .select("qbo_account")
    .in("invoice_id", ids);

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of (lineRows as { qbo_account: string | null }[] | null) ?? []) {
    const key = row.qbo_account?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Read the full mapping state
// ---------------------------------------------------------------------------

/**
 * Load the connected company's accounts + tax codes, the persisted mappings, the
 * GST/PST auto-suggestions, and the unmapped-state signal.
 *
 * `requiredAccountKeys` — the local category/cost-code keys a pending sync would
 * touch (so the gate knows exactly which accounts must be mapped). When the
 * caller passes none (the common case — the Settings panel), they're harvested
 * from the posted invoices via {@link listRequiredAccountKeys}, so the panel
 * always renders a mapping row for every account a sync needs. Tax keys are
 * always the two atomic Canadian taxes (GST, PST).
 */
export async function getMappingState(
  requiredAccountKeys: string[] = []
): Promise<MappingStateResult> {
  return withQboToken<MappingStateResult>(async ({ accessToken, realmId, environment }) => {
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

    // No explicit keys → harvest the account labels every posted invoice carries,
    // so the panel can draw a mapping row for each (the dead-end fix, #187).
    const accountKeys =
      requiredAccountKeys.length > 0 ? requiredAccountKeys : await listRequiredAccountKeys();
    const accountRequirements = buildAccountRequirements(accountKeys, accountByLocal);

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
      requiredAccountKeys: accountKeys,
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
      accountRequirements,
      taxSuggestions,
      unmapped,
    };
  });
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

  return withQboToken<SaveMappingResult>(async ({ realmId, environment }) => {
    const localType = params.kind === "account" ? ACCOUNT_LOCAL_TYPE : TAXCODE_LOCAL_TYPE;
    const qboType = params.kind === "account" ? QBO_TYPE.account : QBO_TYPE.taxCode;

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
  });
}
