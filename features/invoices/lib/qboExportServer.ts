/**
 * QBO-H6 (#189) — server-only I/O for the single-invoice QuickBooks export.
 *
 * The `/api/invoices/[id]/export-qbo` route was the drifted slice-8 stub: it
 * loaded the invoice with a raw `createClient` and called `buildQboBill` with NO
 * central vendor/account/tax maps — bypassing the ADR-0021 `quickbooks_links`
 * table that the live push path honors. This module pulls that DB+build work out
 * of the route and resolves the central refs IDENTICALLY to `loadPushContext`
 * (it shares the very same `resolveInvoiceCentralLinks` helper), so the export
 * payload and the pushed Bill agree on vendor/account/tax.
 *
 * SERVICE-ROLE only (reuses `getServiceRoleClient`); never import from a client
 * component. Degrades gracefully: a missing service client yields "unconfigured"
 * and a missing invoice yields "not_found" — never a throw.
 */
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { getFreshAccessToken } from "./qboConnectionServer";
import { getQuickbooksLink } from "./quickbooksLinksServer";
import { loadMappingLookups } from "./qboAccountMappingServer";
import {
  buildQboBill,
  resolveQboTaxMode,
  type QboBill,
  type QboBillReconciliation,
} from "./qboExport";
import {
  rowToInvoice,
  rowToInvoiceLine,
  type InvoiceRow,
  type InvoiceLineRow,
} from "./invoiceRowMaps";
import type { MappingLookups } from "./qboAccountMapping";
import type { Invoice } from "./types";

/** `quickbooks_links.local_type` for the supplier → QBO Vendor mapping. */
const VENDOR_LOCAL_TYPE = "vendor";

/** The central (ADR 0021) refs resolved for one invoice's company (realm). */
export type InvoiceCentralLinks = {
  /** Central `quickbooks_links` VendorRef — WINS over the embedded qbo_vendor_id. */
  centralVendorRef: string | null;
  /** Persisted local→QBO account/tax-code/tax-rate lookups for this realm. */
  maps: MappingLookups;
};

/**
 * Resolve the central vendor link + account/tax maps for one invoice, the SAME
 * way the push path does. Single source of truth so the export and the push can
 * never drift on which QBO refs an invoice maps to.
 *
 * Requires a connected company (realmId). With no connection there is nothing
 * central to resolve, so callers skip this and let the pure builders fall back
 * to the embedded labels.
 */
export async function resolveInvoiceCentralLinks(
  invoice: Pick<Invoice, "supplierId">,
  realmId: string
): Promise<InvoiceCentralLinks> {
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
  return { centralVendorRef, maps };
}

/** The export route's delegate result: the v3 Bill + its reconciliation. */
export type InvoiceQboExportResult =
  | {
      status: "ok";
      bill: QboBill;
      reconciliation: QboBillReconciliation;
    }
  | { status: "not_found" }
  | { status: "unconfigured" };

/**
 * Load an invoice + its lines and build the QBO v3 Bill payload, resolving
 * vendor/account/tax through `quickbooks_links` identically to the push path.
 * The route is left thin (flag-gate + auth + delegate).
 */
export async function buildInvoiceQboExport(invoiceId: string): Promise<InvoiceQboExportResult> {
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

  // Central-link resolution — identical to loadPushContext. It needs a connected
  // realm; when QBO isn't connected we fall back to the embedded labels so the
  // export still produces a complete, inspectable shape (the old stub behaviour).
  let centralVendorRef: string | null = null;
  let maps: MappingLookups | undefined;
  const tokenResult = await getFreshAccessToken();
  if (tokenResult.ok) {
    const resolved = await resolveInvoiceCentralLinks(invoice, tokenResult.realmId);
    centralVendorRef = resolved.centralVendorRef;
    maps = resolved.maps;
  }

  const { bill, reconciliation } = buildQboBill(invoice, lines, {
    centralVendorRef,
    maps,
    taxMode: resolveQboTaxMode(),
  });

  return { status: "ok", bill, reconciliation };
}
