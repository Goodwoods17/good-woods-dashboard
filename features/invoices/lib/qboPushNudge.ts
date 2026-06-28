/**
 * Pure, I/O-free copy + routing helpers for the QBO push panel's nudges
 * (QBO-H8, issue #191). No Supabase, no QBO API, no React — so the wording and
 * the "does this block link to the mapping panel?" decision are unit-testable.
 *
 * Two distinct nudges live here:
 *   1. block-until-mapped — the gate that stops a push (unmapped vendor /
 *      account / tax, not-posted, already-pushed). Mapping blocks are fixed in
 *      Settings → QuickBooks, so they get an actionable link; the rest don't.
 *   2. reconnect-on-send — when a confirm POST comes back not_connected (e.g. a
 *      token that aged past its 100-day life between load and send), we tell the
 *      owner to reconnect rather than show a generic "couldn't reach" error.
 */

/** The deep link to the QuickBooks settings panel (mapping + connect live there). */
export const QBO_SETTINGS_HREF = "/settings#quickbooks";

/** Explicit reconnect copy shown when a send fails because the token is gone. */
export const QBO_RECONNECT_NOTICE = "Reconnect QuickBooks in Settings to send this bill.";

export type GateBlock =
  | "already_pushed"
  | "not_posted"
  | "vendor_unmapped"
  | "accounts_unmapped"
  | "taxes_unmapped"
  | null;

type GateForMessage = {
  block: GateBlock;
  unmappedAccounts: string[];
  unmappedTaxes: string[];
};

export type BlockGuidance = {
  /** Plain-English reason the push is blocked (empty when not blocked). */
  message: string;
  /** Whether the reason is fixable in Settings → QuickBooks (→ render a link). */
  linkToSettings: boolean;
};

/**
 * The plain-English reason a push is blocked + whether it's actionable in the
 * mapping panel. Only the mapping blocks (vendor / accounts / taxes) link to
 * Settings; not-posted is fixed on the invoice itself and already-pushed is
 * terminal.
 */
export function blockGuidance(gate: GateForMessage): BlockGuidance {
  switch (gate.block) {
    case "already_pushed":
      return { message: "Already sent to QuickBooks.", linkToSettings: false };
    case "not_posted":
      return {
        message: "Post this invoice to actuals before sending it to QuickBooks.",
        linkToSettings: false,
      };
    case "vendor_unmapped":
      return {
        message: "Map this supplier to a QuickBooks vendor first.",
        linkToSettings: true,
      };
    case "accounts_unmapped":
      return {
        message: `Map ${gate.unmappedAccounts.length} expense account${
          gate.unmappedAccounts.length === 1 ? "" : "s"
        } first.`,
        linkToSettings: true,
      };
    case "taxes_unmapped":
      return {
        message: `Map the ${gate.unmappedTaxes.join(", ")} tax code${
          gate.unmappedTaxes.length === 1 ? "" : "s"
        } first.`,
        linkToSettings: true,
      };
    default:
      return { message: "", linkToSettings: false };
  }
}

/**
 * A confirm POST whose failure reason means the QBO connection is gone (token
 * expired / never connected) → the owner should reconnect, not retry blindly.
 */
export function isReconnectReason(reason: string | null | undefined): boolean {
  return reason === "not_connected";
}
