/**
 * GET /api/invoices/[id]/export-qbo — QuickBooks-ready JSON export for one invoice.
 *
 * Thin route (QBO-H6, #189): flag-gate → CRON_SECRET auth → delegate to
 * `buildInvoiceQboExport`. All DB + build work lives in `qboExportServer`, which
 * resolves the vendor/account/tax refs through the central `quickbooks_links`
 * table (ADR 0021) IDENTICALLY to the live push path — no inline raw createClient
 * and no map-less `buildQboBill` here (the slice-8 drift this fixes).
 *
 * Gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` — **404 when off**, like every QBO
 * route. The prior stub only *claimed* to 404 in prod; now it actually does.
 *
 * Auth: the same CRON_SECRET Bearer token as the /process route — this is a
 * machine-to-machine endpoint for the QBO sync layer, not a browser UI route.
 */
import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { buildInvoiceQboExport } from "@features/invoices/lib/qboExportServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // Machine-to-machine auth: require the same CRON_SECRET as the process route.
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!params.id) {
    return NextResponse.json({ error: "missing invoice id" }, { status: 400 });
  }

  const result = await buildInvoiceQboExport(params.id);
  switch (result.status) {
    case "ok":
      return NextResponse.json({
        ok: true,
        export: result.export,
        bill: result.bill,
        reconciliation: result.reconciliation,
      });
    case "not_found":
      return NextResponse.json({ error: "invoice not found" }, { status: 404 });
    case "unconfigured":
      return NextResponse.json({ error: "Supabase credentials not configured" }, { status: 500 });
  }
}
