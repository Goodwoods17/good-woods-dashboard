/**
 * Pure, I/O-free helpers for QBO S10 — un-push / void path (issue #156). No
 * Supabase, no QBO API, no React. The server orchestration that performs the
 * network reversal lives in `qboVoidServer.ts`.
 *
 * "Void" here means: a Bill was pushed to QuickBooks in error (wrong vendor or
 * amount), so we DELETE it in QBO and clear the local `invoice → Bill` link in
 * `quickbooks_links` — which re-opens the block-until-mapped push gate so a
 * corrected invoice can be re-pushed. QBO Bills have no "void" verb (that's for
 * Invoices/Payments/Checks); the reversal for a Bill is a delete, which QBO
 * requires the current `SyncToken` for. So the flow must READ the Bill first to
 * recover its SyncToken, then POST the delete.
 *
 * The two guardrails the slice rests on are encoded here as pure functions:
 *   • VOIDABLE-ONLY-WHEN-PUSHED — {@link evaluateBillVoid} refuses when nothing
 *     was ever pushed (no link to clear, nothing in QBO to delete).
 *   • DELETE-CONFIRMED — {@link parseQboDeleteResponse} only reports success
 *     when QBO echoes `status: "Deleted"`, so we never clear the link on a
 *     response that didn't actually remove the bill.
 */

/** Why a void is refused. Null = voidable. */
export type VoidBlock = "not_pushed";

/** The void verdict for one invoice. */
export type BillVoidGate = {
  /** True only when there is a pushed Bill to reverse. */
  voidable: boolean;
  /** The single reason it's blocked, or null. */
  block: VoidBlock | null;
};

/**
 * Decide whether a pushed invoice's Bill can be voided right now.
 *
 * The only precondition is that something was actually pushed: a void with no
 * stored `invoice → Bill` link has nothing to delete in QBO and no link to
 * clear, so it's refused as `not_pushed`.
 */
export function evaluateBillVoid(params: { alreadyPushed: boolean }): BillVoidGate {
  if (!params.alreadyPushed) return { voidable: false, block: "not_pushed" };
  return { voidable: true, block: null };
}

/** A short, human-readable sentence for a void block reason (for the UI). */
export function voidBlockMessage(gate: BillVoidGate): string | null {
  switch (gate.block) {
    case null:
      return null;
    case "not_pushed":
      return "This invoice hasn't been sent to QuickBooks, so there's nothing to void.";
  }
}

/** Id + SyncToken (+ doc number) recovered from a QBO Bill read. */
export type QboBillReadRef = { id: string; syncToken: string; docNumber: string | null };

/**
 * Parse `GET /v3/company/{realm}/bill/{id}` into the Id + SyncToken a delete
 * needs. Returns null if the body carries no usable Bill (id or sync token
 * missing). SyncToken "0" is valid, so check presence, not truthiness.
 */
export function parseQboBillRead(body: unknown): QboBillReadRef | null {
  const resp = body as { Bill?: { Id?: string; SyncToken?: string; DocNumber?: string } } | null;
  const bill = resp?.Bill;
  if (!bill || bill.Id == null || bill.SyncToken == null) return null;
  return { id: bill.Id, syncToken: bill.SyncToken, docNumber: bill.DocNumber ?? null };
}

/** The request body for `POST /bill?operation=delete` — exactly Id + SyncToken. */
export function buildVoidDeleteBody(params: { id: string; syncToken: string }): {
  Id: string;
  SyncToken: string;
} {
  return { Id: params.id, SyncToken: params.syncToken };
}

/** Outcome of a QBO delete: the bill id + whether QBO confirmed it as Deleted. */
export type QboDeleteResult = { id: string; deleted: boolean };

/**
 * Parse a QBO delete response. QBO echoes `{ Bill: { Id, status: "Deleted" } }`
 * on success. We only treat the reversal as done when `status === "Deleted"`.
 */
export function parseQboDeleteResponse(body: unknown): QboDeleteResult | null {
  const resp = body as { Bill?: { Id?: string; status?: string } } | null;
  const bill = resp?.Bill;
  if (!bill?.Id) return null;
  return { id: bill.Id, deleted: bill.status === "Deleted" };
}
