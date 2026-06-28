/**
 * QBO S3 — Vendor mapping API (issue #149).
 *
 * GET  /api/invoices/qbo/vendors
 *   List all Vendors in the connected QBO company (for the owner's picker UI
 *   when a name match is ambiguous).
 *
 * POST /api/invoices/qbo/vendors
 *   Resolve a local `catalog_suppliers` row to a QBO Vendor id.
 *   Body: { supplierId: string, qboVendorId?: string }
 *   - `supplierId`   — the `catalog_suppliers.id` to map.
 *   - `qboVendorId` — if provided (owner chose from the ambiguous picker), skip
 *     matching and store this id directly.
 *   Returns: { ok, status, qboId?, qboVendorName?, created?, candidates? }
 *
 * Both routes are gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` and protected by
 * the app's auth middleware (owner-only, same as QBO S1/S2 routes). Degrades
 * cleanly when QBO is unconfigured or the token is missing.
 */
import { NextRequest, NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { getFreshAccessToken } from "@features/invoices/lib/qboConnectionServer";
import {
  listQboVendors,
  resolveSupplierVendor,
} from "@features/invoices/lib/qboVendorSyncServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — list all QBO vendors (used by the ambiguous-match picker UI)
// ---------------------------------------------------------------------------

export async function GET() {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const token = await getFreshAccessToken();
  if (!token.ok) {
    const status = token.reason === "unconfigured" ? 503 : 400;
    return NextResponse.json({ ok: false, reason: token.reason }, { status });
  }

  try {
    const vendors = await listQboVendors(token.accessToken, token.realmId, token.environment);
    return NextResponse.json({ ok: true, vendors });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "qbo_error", message: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — resolve a supplier → QBO vendor (match / create / pin)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  let body: { supplierId?: unknown; qboVendorId?: unknown };
  try {
    body = (await request.json()) as { supplierId?: unknown; qboVendorId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  if (!body.supplierId || typeof body.supplierId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "missing_supplier_id" },
      { status: 400 }
    );
  }

  const qboVendorId =
    typeof body.qboVendorId === "string" && body.qboVendorId.length > 0
      ? body.qboVendorId
      : null;

  const result = await resolveSupplierVendor({
    supplierId: body.supplierId,
    qboVendorId,
  });

  switch (result.status) {
    case "unconfigured":
      return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });

    case "not_connected":
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 400 });

    case "supplier_not_found":
      return NextResponse.json(
        { ok: false, reason: "supplier_not_found" },
        { status: 404 }
      );

    case "qbo_error":
      return NextResponse.json(
        { ok: false, reason: "qbo_error", message: result.message },
        { status: 502 }
      );

    case "ambiguous":
      // 200 with disambiguation candidates — the client shows a picker.
      return NextResponse.json({ ok: true, status: "ambiguous", candidates: result.candidates });

    case "mapped":
      return NextResponse.json({
        ok: true,
        status: "mapped",
        qboId: result.qboId,
        qboVendorName: result.qboVendorName,
        created: result.created,
      });
  }
}
