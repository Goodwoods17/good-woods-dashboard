/**
 * Pure, I/O-free helpers for QBO S7 — push a posted invoice as a QBO Bill
 * (issue #153). No Supabase, no QBO API, no React. The server orchestration that
 * actually performs the network write lives in `qboBillPushServer.ts`.
 *
 * Two guarantees the slice's done-when rests on are encoded here as pure
 * functions so they're exhaustively testable without a live sandbox:
 *
 *  • BLOCK-UNTIL-MAPPED — {@link evaluateBillPush} refuses a push while the
 *    vendor, any line's expense account, or any taxable line's tax code is
 *    unresolved against the central `quickbooks_links` mappings.
 *  • IDEMPOTENT REFUSE — the same gate refuses when the invoice already carries
 *    a QBO Bill link (`alreadyPushed`), so re-sending creates nothing.
 *
 * Plus the "View in QuickBooks" deep link and the request-body sanitiser that
 * strips our internal underscore-prefixed bookkeeping before the bill is POSTed.
 */
import type { QboEnvironment } from "./qboOAuth";
import type { LineTaxKey, QboBillReconciliation } from "./qboExport";
import type { MappingLookups } from "./qboAccountMapping";

/** Why a push is refused. Null = pushable. Ordered by precedence in the gate. */
export type BillPushBlock =
  | "already_pushed"
  | "not_posted"
  | "total_mismatch"
  | "vendor_unmapped"
  | "accounts_unmapped"
  | "taxes_unmapped";

/** One line's mapping-relevant facts for the gate. */
export type LineGateInput = {
  /** The line's local expense-account key (`invoice_lines.qbo_account`). */
  account: string | null;
  /** The line's resolved Canadian tax key, or null for a non-taxable line. */
  taxKey: LineTaxKey;
};

/** The block-until-mapped + idempotency verdict for one invoice. */
export type BillPushGate = {
  /** True only when the bill may be created in QBO right now. */
  pushable: boolean;
  /** The single reason it's blocked (highest precedence), or null. */
  block: BillPushBlock | null;
  /** Local account keys with no QBO link (for the UI to spell out the fix). */
  unmappedAccounts: string[];
  /** Local tax keys with no QBO link. */
  unmappedTaxes: string[];
  /** True when the invoice's vendor resolves to a QBO VendorRef. */
  vendorMapped: boolean;
  /**
   * True when the stated invoice total does not match Σ lines + GST + PST.
   * Surfaced even when another block takes precedence (so the UI can show
   * both problems at once).
   */
  totalMismatch: boolean;
};

/** Sentinel listed in `unmappedAccounts` when a line carries no account at all. */
export const NO_ACCOUNT_KEY = "(no account)";

/**
 * Decide whether a posted invoice can be pushed to QBO as a Bill.
 *
 * Precedence (the UI shows exactly one primary reason):
 *   1. `already_pushed`  — a Bill link exists → refuse (idempotent; re-send is a
 *      no-op). Wins even when everything else is in order.
 *   2. `not_posted`      — only a `posted` invoice is eligible (post-then-send).
 *   3. `total_mismatch`  — Σ lines + GST + PST ≠ stated total (S9): the bill
 *      would book the wrong amount in QBO; must be corrected before pushing.
 *   4. `vendor_unmapped` — no VendorRef resolved.
 *   5. `accounts_unmapped` — some line has no (mapped) expense account. A line
 *      with a null account counts: every QBO Bill line needs an AccountRef.
 *   6. `taxes_unmapped`  — some TAXABLE line's tax key has no QBO TaxCode link.
 *
 * Non-taxable lines (null tax key) never gate on tax.
 *
 * `reconciliation` is optional for backward-compatibility (pre-S9 callers that
 * don't yet supply it). When absent the total-mismatch gate is skipped.
 */
export function evaluateBillPush(params: {
  invoiceStatus: string;
  alreadyPushed: boolean;
  vendorRef: string | null;
  lines: LineGateInput[];
  maps: MappingLookups;
  /** S9: when supplied, a mis-balanced reconciliation blocks the push. */
  reconciliation?: QboBillReconciliation;
}): BillPushGate {
  const { invoiceStatus, alreadyPushed, vendorRef, lines, maps, reconciliation } = params;

  const unmappedAccounts: string[] = [];
  const seenAcct = new Set<string>();
  for (const l of lines) {
    const key = l.account?.trim();
    const unresolved = !key ? NO_ACCOUNT_KEY : maps.accountByLocal[key] ? null : key;
    if (unresolved && !seenAcct.has(unresolved)) {
      seenAcct.add(unresolved);
      unmappedAccounts.push(unresolved);
    }
  }

  const unmappedTaxes: string[] = [];
  const seenTax = new Set<string>();
  for (const l of lines) {
    if (l.taxKey == null) continue;
    if (!maps.taxByLocal[l.taxKey] && !seenTax.has(l.taxKey)) {
      seenTax.add(l.taxKey);
      unmappedTaxes.push(l.taxKey);
    }
  }

  const vendorMapped = vendorRef != null && vendorRef !== "";

  // S9: total-mismatch flag — computed independent of the block precedence so
  // the UI can show it alongside another block reason if needed.
  const totalMismatch = reconciliation != null && !reconciliation.balanced;

  let block: BillPushBlock | null = null;
  if (alreadyPushed) block = "already_pushed";
  else if (invoiceStatus !== "posted") block = "not_posted";
  else if (totalMismatch) block = "total_mismatch";
  else if (!vendorMapped) block = "vendor_unmapped";
  else if (unmappedAccounts.length > 0) block = "accounts_unmapped";
  else if (unmappedTaxes.length > 0) block = "taxes_unmapped";

  return {
    pushable: block === null,
    block,
    unmappedAccounts,
    unmappedTaxes,
    vendorMapped,
    totalMismatch,
  };
}

/** A short, human-readable sentence for a block reason (for the UI badge/notice). */
export function billPushBlockMessage(gate: BillPushGate): string | null {
  switch (gate.block) {
    case null:
      return null;
    case "already_pushed":
      return "Already sent to QuickBooks.";
    case "not_posted":
      return "Post this invoice to actuals before sending it to QuickBooks.";
    case "total_mismatch":
      return "Invoice total does not match line items + taxes — correct it before sending to QuickBooks.";
    case "vendor_unmapped":
      return "Map this supplier to a QuickBooks vendor first.";
    case "accounts_unmapped":
      return `Map ${gate.unmappedAccounts.length} expense account${
        gate.unmappedAccounts.length === 1 ? "" : "s"
      } in Settings → QuickBooks first.`;
    case "taxes_unmapped":
      return `Map the ${gate.unmappedTaxes.join(", ")} tax code${
        gate.unmappedTaxes.length === 1 ? "" : "s"
      } in Settings → QuickBooks first.`;
  }
}

/** FNV-1a 32-bit hash → 8 lowercase-hex chars. Stable across processes/runs. */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * A deterministic QBO `RequestId` idempotency key for one invoice→Bill create
 * (issue #184, QBO-H1).
 *
 * QBO honours a `requestid` query param on POST: two create requests carrying
 * the SAME RequestId are deduped server-side — the second returns the first's
 * Bill instead of creating a second one. Because this is a pure function of
 * `(realmId, invoiceId)` with no randomness, two concurrent pushes that both
 * read `existingBillId = null` (the race in `qboBillPushServer.ts`) — or any
 * retry — send the identical key and therefore collapse to exactly ONE Bill in
 * QuickBooks. This closes the duplicate-bill window the local link unique
 * constraint can't (it only dedupes the link row, after the POST).
 *
 * The key is URL-safe and well within QBO's 50-char RequestId limit. Both ids
 * are folded into a 64-bit (2×32-bit) hash so distinct invoices/companies get
 * distinct keys without leaking ids into request logs.
 */
export function qboBillRequestId(realmId: string, invoiceId: string): string {
  return `gwbill-${fnv1aHex(`${realmId}:${invoiceId}`)}-${fnv1aHex(invoiceId)}`;
}

/**
 * The "View in QuickBooks" deep link for a created Bill. Sandbox and production
 * live on different QBO web hosts; the bill opens via its transaction id.
 */
export function qboBillDeepLink(environment: QboEnvironment, billId: string): string {
  const host =
    environment === "production"
      ? "https://app.qbo.intuit.com"
      : "https://app.sandbox.qbo.intuit.com";
  return `${host}/app/bill?txnId=${encodeURIComponent(billId)}`;
}

/**
 * Recursively drop every underscore-prefixed key. Our built bill carries
 * internal bookkeeping (`_kind`, `_jobId`, `_pstShare`, `_localTaxKey`,
 * `_component`) for provenance; QBO must never see those in the request body.
 */
export function stripInternalFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripInternalFields(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      out[k] = stripInternalFields(v);
    }
    return out as T;
  }
  return value;
}

/** Sanitise a built {@link import("./qboExport").QboBill} into a QBO request body. */
export function toQboBillRequestBody(bill: unknown): Record<string, unknown> {
  return stripInternalFields(bill) as Record<string, unknown>;
}
