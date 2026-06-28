import { NextResponse } from "next/server";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import { getGoogleConnectionStatus } from "@features/scheduling/lib/googleCalendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only status probe for the Google Calendar push panel (S23, issue #111).
 * Gated on the P6 flag (404 when off) and the auth middleware. Returns
 * `{ configured, connected, accountEmail }` so the UI can render the right
 * state — "not configured" (no OAuth creds), "connect" (configured, no token),
 * or "connected" — without ever exposing the token.
 */
export async function GET() {
  if (!schedulingP6Enabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const status = await getGoogleConnectionStatus();
  return NextResponse.json({ ok: true, ...status });
}
