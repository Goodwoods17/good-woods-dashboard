import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { disconnectQbo } from "@features/invoices/lib/qboConnectionServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disconnect the QuickBooks company (QBO S1): drops the stored connection (and
 * its encrypted tokens). Gated on the INVOICES_QBO flag (404) + auth middleware.
 * We deliberately do NOT revoke the token with Intuit here — re-connecting mints
 * a fresh consent; this tracer just clears local state.
 */
export async function POST() {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const result = await disconnectQbo();
  return NextResponse.json({ ok: result.ok });
}
