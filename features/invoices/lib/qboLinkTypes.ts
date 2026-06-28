/**
 * Centralized `quickbooks_links` type literals (QBO-H10 consolidation, #193).
 *
 * `local_type` is the local entity a mapping points FROM; `qbo_type` is the QBO
 * entity it points TO. These strings were duplicated as inline literals and
 * per-file `const`s across the QBO servers, so a typo ("Taxcode" vs "TaxCode")
 * would silently mis-key a lookup. One source of truth here removes that class
 * of bug.
 */

/** `quickbooks_links.local_type` — the local entity a QBO mapping points FROM. */
export type QboLocalType = "invoice" | "vendor" | "account" | "taxcode" | "taxrate";

/** `quickbooks_links.qbo_type` — the QBO entity a mapping points TO. */
export type QboType = "Bill" | "Vendor" | "Account" | "TaxCode";

/** Canonical `local_type` values, keyed for readable call sites. */
export const QBO_LOCAL_TYPE = {
  invoice: "invoice",
  vendor: "vendor",
  account: "account",
  taxcode: "taxcode",
  taxrate: "taxrate",
} as const satisfies Record<QboLocalType, QboLocalType>;

/** Canonical `qbo_type` values, keyed for readable call sites. */
export const QBO_TYPE = {
  bill: "Bill",
  vendor: "Vendor",
  account: "Account",
  taxCode: "TaxCode",
} as const satisfies Record<string, QboType>;
