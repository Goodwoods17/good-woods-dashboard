/**
 * Server-only I/O for QBO S7 — push a posted invoice to QuickBooks as a Bill
 * (issue #153). SERVICE-ROLE only; never import from a client component.
 *
 * Brings together the pieces S1–S6 built: a fresh access token (S1), the
 * central `quickbooks_links` mappings (S2–S5), the pure `buildQboBill` payload
 * (S6), and the pure block-until-mapped + idempotency gate (`qboBillPush`).
 *
 * Idempotency is belt-and-suspenders:
 *   1. Local link — a stored `invoice → Bill` link in `quickbooks_links` short-
 *      circuits before any network call (re-send = no-op).
 *   2. Query-before-create — even with no local link we first query QBO for a
 *      Bill with the same DocNumber + vendor; a hit is adopted (link stored),
 *      never duplicated. Only a genuine miss POSTs a new Bill.
 *
 * Every entry point degrades gracefully when QBO is unconfigured / not connected
 * (typed result, never a throw) — mirrors `qboVendorSyncServer.ts`.
 */
import { qboApiBaseUrl, type QboEnvironment } from "./qboOAuth";
import { getFreshAccessToken } from "./qboConnectionServer";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import {
  rowToInvoice,
  rowToInvoiceLine,
  type InvoiceRow,
  type InvoiceLineRow,
} from "./invoiceRowMaps";
import { buildQboBill, lineTaxKey, type QboBill, type QboBillReconciliation } from "./qboExport";
import { loadMappingLookups } from "./qboAccountMappingServer";
import { getQuickbooksLink, upsertQuickbooksLink } from "./quickbooksLinksServer";
import {
  evaluateBillPush,
  qboBillDeepLink,
  toQboBillRequestBody,
  type BillPushGate,
} from "./qboBillPush";
import type { Invoice, InvoiceLine } from "./types";

/** `quickbooks_links.local_type` / `qbo_type` for the invoice → Bill mapping. */
const INVOICE_LOCAL_TYPE = "invoice";
const BILL_QBO_TYPE = "Bill";
const VENDOR_LOCAL_TYPE = "vendor";

// ---------------------------------------------------------------------------
// QBO Bill API helpers
// ---------------------------------------------------------------------------

/** Minimal shape we read back from a queried / created QBO Bill. */
export type QboBillRef = { id: string; docNumber: string | null };

/** Parse `SELECT * FROM Bill WHERE DocNumber = '…'` into the first match. */
export function parseQboBillQuery(body: unknown): QboBillRef | null {
  const resp = body as { QueryResponse?: { Bill?: unknown[] } } | null;
  const raw = resp?.QueryResponse?.Bill ?? [];
  const first = (raw as { Id?: string; DocNumber?: string }[])[0];
  if (!first?.Id) return null;
  return { id: first.Id, docNumber: first.DocNumber ?? null };
}

/** Parse a created-Bill response body into its id + doc number. */
export function parseQboCreatedBill(body: unknown): QboBillRef | null {
  const resp = body as { Bill?: { Id?: string; DocNumber?: string } } | null;
  const bill = resp?.Bill;
  if (!bill?.Id) return null;
  return { id: bill.Id, docNumber: bill.DocNumber ?? null };
}

/** Find an existing QBO Bill by its DocNumber (the invoice number). */
async function findQboBillByDocNumber(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  docNumber: string
): Promise<QboBillRef | null> {
  const base = qboApiBaseUrl(environment);
  // Escape single quotes per QBO query-language rules.
  const safe = docNumber.replace(/'/g, "\\'");
  const query = `SELECT * FROM Bill WHERE DocNumber = '${safe}'`;
  const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`QBO bill query failed: ${res.status} ${res.statusText}`);
  return parseQboBillQuery(await res.json());
}

/** Create a Bill in the connected QBO company. Throws on a non-2xx response. */
async function createQboBill(
  accessToken: string,
  realmId: string,
  environment: QboEnvironment,
  requestBody: Record<string, unknown>
): Promise<QboBillRef> {
  const base = qboApiBaseUrl(environment);
  const url = `${base}/v3/company/${realmId}/bill?minorversion=65`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error(`QBO bill create failed: ${res.status} ${res.statusText}`);
  const created = parseQboCreatedBill(await res.json());
  if (!created) throw new Error("QBO bill create returned no Bill in body");
  return created;
}

// ---------------------------------------------------------------------------
// Load the invoice + lines + mappings + built bill (shared by preview & push)
// ---------------------------------------------------------------------------

type LoadedContext = {
  invoice: Invoice;
  lines: InvoiceLine[];
  bill: QboBill;
  reconciliation: QboBillReconciliation;
  gate: BillPushGate;
  existingBillId: string | null;
  realmId: string;
  environment: QboEnvironment;
  accessToken: string;
};

type LoadError = { status: "not_connected" | "unconfigured" | "not_found"; message?: string };

async function loadPushContext(invoiceId: string): Promise<LoadedContext | LoadError> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return { status: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected" };
  }
  const { accessToken, realmId, environment } = tokenResult;

  const sb = getServiceRoleClient();
  if (!sb) return { status: "unconfigured" };

  const { data: invRow } = await sb
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();
  if (!invRow) return { status: "not_found" };

  const { data: lineRows } = await sb
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  const invoice = rowToInvoice(invRow);
  const lines = ((lineRows as InvoiceLineRow[] | null) ?? []).map(rowToInvoiceLine);

  // Central vendor link (ADR 0021) wins over the embedded qbo_vendor_id.
  let centralVendorRef: string | null = null;
  if (invoice.supplierId) {
    const vendorLink = await getQuickbooksLink({
      realmId,
      localType: VENDOR_LOCAL_TYPE,
      localId: invoice.supplierId,
    });
    centralVendorRef = vendorLink?.qboId ?? null;
  }

  const maps = await loadMappingLookups(realmId);
  const { bill, reconciliation } = buildQboBill(invoice, lines, { centralVendorRef, maps });

  // Existing Bill link → idempotent short-circuit signal.
  const existingLink = await getQuickbooksLink({
    realmId,
    localType: INVOICE_LOCAL_TYPE,
    localId: invoice.id,
  });
  const existingBillId = existingLink?.qboId ?? null;

  const gate = evaluateBillPush({
    invoiceStatus: invoice.status,
    alreadyPushed: existingBillId != null,
    vendorRef: bill.VendorRef?.value ?? null,
    lines: lines.map((l) => ({
      account: l.qboAccount,
      taxKey: lineTaxKey(l.taxFlag, { gst: invoice.gst, pst: invoice.pst }),
    })),
    maps,
  });

  return {
    invoice,
    lines,
    bill,
    reconciliation,
    gate,
    existingBillId,
    realmId,
    environment,
    accessToken,
  };
}

// ---------------------------------------------------------------------------
// Preview (no write) — powers the "Send to QuickBooks" preview/confirm UI
// ---------------------------------------------------------------------------

export type PushPreview =
  | {
      status: "ok";
      bill: QboBill;
      reconciliation: QboBillReconciliation;
      gate: BillPushGate;
      alreadyPushed: boolean;
      billId: string | null;
      deepLink: string | null;
      environment: QboEnvironment;
    }
  | LoadError;

/** Build the bill + gate WITHOUT touching QBO's write API (read-only preview). */
export async function previewInvoicePush(invoiceId: string): Promise<PushPreview> {
  const ctx = await loadPushContext(invoiceId);
  if (!("invoice" in ctx)) return ctx;
  const c = ctx;
  return {
    status: "ok",
    bill: c.bill,
    reconciliation: c.reconciliation,
    gate: c.gate,
    alreadyPushed: c.existingBillId != null,
    billId: c.existingBillId,
    deepLink: c.existingBillId ? qboBillDeepLink(c.environment, c.existingBillId) : null,
    environment: c.environment,
  };
}

// ---------------------------------------------------------------------------
// Push (write) — idempotent create
// ---------------------------------------------------------------------------

export type PushResult =
  | { status: "pushed"; billId: string; docNumber: string | null; deepLink: string }
  | { status: "already_pushed"; billId: string; deepLink: string }
  | { status: "blocked"; gate: BillPushGate }
  | { status: "not_connected" | "unconfigured" | "not_found" | "qbo_error"; message?: string };

/**
 * Push the invoice's Bill to QBO, exactly once.
 *
 * Order: local-link short-circuit → block-until-mapped gate → query-before-create
 * → POST → store the Bill link. A second call after a successful push hits the
 * local-link short-circuit and creates nothing.
 */
export async function pushInvoiceBill(invoiceId: string): Promise<PushResult> {
  const ctx = await loadPushContext(invoiceId);
  if (!("invoice" in ctx)) return ctx;
  const c = ctx;

  // 1. Idempotent short-circuit: already linked → return, no network write.
  if (c.existingBillId) {
    return {
      status: "already_pushed",
      billId: c.existingBillId,
      deepLink: qboBillDeepLink(c.environment, c.existingBillId),
    };
  }

  // 2. Block-until-mapped (+ not-posted). Refuse before any write.
  if (!c.gate.pushable) {
    return { status: "blocked", gate: c.gate };
  }

  // 3. Query-before-create: adopt an existing QBO Bill with the same DocNumber.
  const docNumber = c.bill.DocNumber;
  try {
    if (docNumber) {
      const existing = await findQboBillByDocNumber(
        c.accessToken,
        c.realmId,
        c.environment,
        docNumber
      );
      if (existing) {
        await upsertQuickbooksLink({
          localType: INVOICE_LOCAL_TYPE,
          localId: c.invoice.id,
          qboType: BILL_QBO_TYPE,
          qboId: existing.id,
          realmId: c.realmId,
          environment: c.environment,
          syncedAt: new Date().toISOString(),
        });
        return {
          status: "already_pushed",
          billId: existing.id,
          deepLink: qboBillDeepLink(c.environment, existing.id),
        };
      }
    }

    // 4. Create the Bill (internal underscore-prefixed bookkeeping stripped).
    const created = await createQboBill(
      c.accessToken,
      c.realmId,
      c.environment,
      toQboBillRequestBody(c.bill)
    );

    // 5. Persist the invoice → Bill link so re-sends short-circuit forever.
    await upsertQuickbooksLink({
      localType: INVOICE_LOCAL_TYPE,
      localId: c.invoice.id,
      qboType: BILL_QBO_TYPE,
      qboId: created.id,
      realmId: c.realmId,
      environment: c.environment,
      syncedAt: new Date().toISOString(),
    });

    return {
      status: "pushed",
      billId: created.id,
      docNumber: created.docNumber,
      deepLink: qboBillDeepLink(c.environment, created.id),
    };
  } catch (e) {
    return { status: "qbo_error", message: e instanceof Error ? e.message : String(e) };
  }
}
