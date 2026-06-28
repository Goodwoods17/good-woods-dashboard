import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { getQboConnectionStatus } from "@features/invoices/lib/qboConnectionServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only status probe for the Connect QuickBooks settings panel (QBO S1,
 * issue #147). Gated on the INVOICES_QBO flag (404 when off) and the auth
 * middleware. Returns `{ configured, connected, companyName, environment }` so
 * the UI can render the right state — "not configured" (no OAuth creds),
 * "connect" (configured, no token), or "connected" — without exposing any token.
 */
export async function GET() {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const status = await getQboConnectionStatus();
  return NextResponse.json({ ok: true, ...status });
}
