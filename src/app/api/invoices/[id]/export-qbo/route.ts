/**
 * GET /api/invoices/[id]/export-qbo — QuickBooks-ready JSON export stub.
 *
 * Returns the QBO-mappable shape for a single invoice so a future sync layer
 * can submit it to the QBO v3 Bill endpoint without rework. No QBO API calls
 * happen here — that is Phase 2 (see features/invoices/CLAUDE.md non-goals).
 *
 * Auth: same CRON_SECRET Bearer token as the /process route — this is a
 * machine-to-machine stub for the future QBO agent, not a browser UI route.
 * A future UI "Export to QuickBooks" button can call this via a server action
 * (which supplies the secret from the server side).
 *
 * Feature-flagged: the /invoices route 404s in prod when INVOICES_ENABLED is
 * absent; this route follows suit so the export surface stays dormant until
 * the owner explicitly enables the feature.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildQboExport, buildQboBill, resolveQboTaxMode } from "@features/invoices/lib/qboExport";
import {
  rowToInvoice,
  rowToInvoiceLine,
  type InvoiceRow,
  type InvoiceLineRow,
} from "@features/invoices/lib/invoiceRowMaps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Auth: require the same CRON_SECRET used by the process route.
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase credentials not configured" }, { status: 500 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "missing invoice id" }, { status: 400 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Fetch the invoice header.
  const { data: invRow, error: invErr } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }
  if (!invRow) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }

  // Fetch the invoice lines ordered by line_no.
  const { data: lineRows, error: lineErr } = await sb
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });
  if (lineErr) {
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  const invoice = rowToInvoice(invRow);
  const lines = (lineRows as InvoiceLineRow[]).map(rowToInvoiceLine);
  const exportShape = buildQboExport(invoice, lines);
  // QBO S6 (#152): the real QBO v3 Bill payload + its total reconciliation.
  // No central account/tax maps are threaded here yet (the sync layer that
  // consumes /quickbooks_links will pass them) — without maps the bill carries
  // the raw local labels, so the shape is still complete + inspectable.
  const { bill, reconciliation } = buildQboBill(invoice, lines, {
    taxMode: resolveQboTaxMode(),
  });

  return NextResponse.json({ ok: true, export: exportShape, bill, reconciliation });
}
