import "server-only";
/**
 * Server-only I/O for QBO S10 — un-push / void path (issue #156). SERVICE-ROLE
 * only; never import from a client component.
 *
 * Voids (reverses) a Bill that was pushed to QuickBooks in error: it DELETEs the
 * Bill in QBO and clears the local `invoice → Bill` link in `quickbooks_links`,
 * which re-opens the push gate so a corrected invoice can be re-pushed. Every
 * attempt is recorded in the same `qbo_push_attempts` audit trail as the push
 * (kind = 'void'), so the full lifecycle is auditable per invoice.
 *
 * QBO Bills have no "void" verb — the reversal is a delete, which QBO requires
 * the current `SyncToken` for. So the flow is READ the Bill (recover SyncToken)
 * → POST the delete → clear the link. If the Bill is already gone in QBO (404),
 * we still clear the stale link so the invoice can be re-pushed (self-healing).
 *
 * Degrades gracefully when QBO is unconfigured / not connected (typed result,
 * never a throw, never a token leak) — mirrors `qboBillPushServer.ts`.
 */
import { type QboEnvironment } from "./qboOAuth";
import { qboFetch, qboMutate } from "./qboClient";
import { withQboToken } from "./withQboToken";
import { QBO_LOCAL_TYPE } from "./qboLinkTypes";
import { getQuickbooksLink, deleteQuickbooksLink } from "./quickbooksLinksServer";
import { qboBillDeepLink } from "./qboBillPush";
import {
  evaluateBillVoid,
  parseQboBillRead,
  buildVoidDeleteBody,
  parseQboDeleteResponse,
  type BillVoidGate,
} from "./qboVoid";
import { logPushAttempt } from "./qboPushAuditServer";
import { isTransientHttpStatus } from "./qboPushAudit";

const INVOICE_LOCAL_TYPE = QBO_LOCAL_TYPE.invoice;

// ---------------------------------------------------------------------------
// QBO Bill read + delete helpers
// ---------------------------------------------------------------------------

type BillReadResult =
  | { ok: true; syncToken: string; docNumber: string | null }
  | { ok: false; gone: true }
  | { ok: false; gone: false; httpStatus: number; message: string };

/** Read a Bill by id to recover its SyncToken (required to delete it). */
async function readQboBill(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  billId: string
): Promise<BillReadResult> {
  const res = await qboFetch({
    accessToken,
    realmId,
    environment,
    path: `bill/${encodeURIComponent(billId)}`,
  });
  // 404 (or 410): the bill no longer exists in QBO — treat as already gone so we
  // still clear the stale link below (self-healing un-push).
  if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
  if (!res.ok) {
    return {
      ok: false,
      gone: false,
      httpStatus: res.status,
      message: `QBO bill read failed: ${res.status} ${res.statusText}`,
    };
  }
  const ref = parseQboBillRead(await res.json());
  if (!ref) {
    return { ok: false, gone: false, httpStatus: 200, message: "QBO bill read returned no Bill" };
  }
  return { ok: true, syncToken: ref.syncToken, docNumber: ref.docNumber };
}

type BillDeleteResult =
  { ok: true } | { ok: false; httpStatus: number; body: unknown; message: string };

/** Delete a Bill in QBO via `?operation=delete` (Id + SyncToken in the body). */
async function deleteQboBill(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  billId: string,
  syncToken: string
): Promise<BillDeleteResult> {
  const res = await qboMutate(
    { accessToken, realmId, environment },
    "bill",
    buildVoidDeleteBody({ id: billId, syncToken }),
    { operation: "delete" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return {
      ok: false,
      httpStatus: res.status,
      body,
      message: `QBO bill delete failed: ${res.status} ${res.statusText}`,
    };
  }
  const parsed = parseQboDeleteResponse(await res.json());
  if (!parsed?.deleted) {
    return { ok: false, httpStatus: 200, body: parsed, message: "QBO did not confirm the delete" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Void (write) — guarded reversal
// ---------------------------------------------------------------------------

export type VoidResult =
  | { status: "voided"; billId: string; deepLink: string }
  | { status: "not_pushed"; gate: BillVoidGate }
  | { status: "not_connected" | "unconfigured" | "not_found" | "qbo_error"; message?: string };

/**
 * Void the invoice's pushed Bill in QBO, then clear the local link so it can be
 * re-pushed. Confirm-gated at the API layer (POST only). Logs the attempt to
 * `qbo_push_attempts` (kind = 'void').
 *
 * Order: fresh token → load invoice→Bill link → READ bill (SyncToken) → DELETE
 * → clear link → log. A bill already gone in QBO short-circuits to clearing the
 * link (so a wrongly-pushed bill the owner deleted by hand can still be re-pushed).
 *
 * @param voidedBy The authenticated user who triggered the void (email/user-id).
 */
export async function voidInvoiceBill(
  invoiceId: string,
  voidedBy?: string | null
): Promise<VoidResult> {
  return withQboToken<VoidResult>(async ({ accessToken, realmId, environment }) => {
    // The pushed Bill link is the thing we're reversing. No link → nothing to void.
    const existingLink = await getQuickbooksLink({
      realmId,
      localType: INVOICE_LOCAL_TYPE,
      localId: invoiceId,
    });
    const billId = existingLink?.qboId ?? null;

    const gate = evaluateBillVoid({ alreadyPushed: billId != null });
    if (!gate.voidable || !billId) {
      return { status: "not_pushed", gate };
    }

    try {
      // 1. Read the Bill to recover its SyncToken (QBO delete requires it).
      const read = await readQboBill(accessToken, realmId, environment, billId);

      // 1a. Already gone in QBO → just clear the stale link (self-healing un-push).
      if (!read.ok && read.gone) {
        await deleteQuickbooksLink({ realmId, localType: INVOICE_LOCAL_TYPE, localId: invoiceId });
        await logPushAttempt({
          invoiceId,
          kind: "void",
          status: "succeeded",
          qboBillId: billId,
          responseBody: { alreadyGone: true },
          pushedBy: voidedBy ?? null,
          realmId,
          environment,
        });
        return {
          status: "voided",
          billId,
          deepLink: qboBillDeepLink(environment, billId),
        };
      }

      if (!read.ok) {
        await logPushAttempt({
          invoiceId,
          kind: "void",
          status: isTransientHttpStatus(read.httpStatus) ? "failed_transient" : "failed_permanent",
          qboBillId: billId,
          httpStatus: read.httpStatus,
          errorMessage: read.message,
          pushedBy: voidedBy ?? null,
          realmId,
          environment,
        });
        return { status: "qbo_error", message: read.message };
      }

      // 2. Delete the Bill in QBO.
      const del = await deleteQboBill(accessToken, realmId, environment, billId, read.syncToken);
      if (!del.ok) {
        await logPushAttempt({
          invoiceId,
          kind: "void",
          status: isTransientHttpStatus(del.httpStatus) ? "failed_transient" : "failed_permanent",
          qboBillId: billId,
          httpStatus: del.httpStatus,
          responseBody: del.body,
          errorMessage: del.message,
          pushedBy: voidedBy ?? null,
          realmId,
          environment,
        });
        return { status: "qbo_error", message: del.message };
      }

      // 3. Clear the local link so the (corrected) invoice can be re-pushed.
      await deleteQuickbooksLink({ realmId, localType: INVOICE_LOCAL_TYPE, localId: invoiceId });

      // 4. Record the successful void in the shared audit trail.
      await logPushAttempt({
        invoiceId,
        kind: "void",
        status: "succeeded",
        qboBillId: billId,
        responseBody: { deleted: true },
        pushedBy: voidedBy ?? null,
        realmId,
        environment,
      });

      return {
        status: "voided",
        billId,
        deepLink: qboBillDeepLink(environment, billId),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logPushAttempt({
        invoiceId,
        kind: "void",
        status: "failed_transient",
        qboBillId: billId,
        errorMessage: message,
        pushedBy: voidedBy ?? null,
        realmId,
        environment,
      });
      return { status: "qbo_error", message };
    }
  });
}
