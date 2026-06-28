import { NextResponse } from "next/server";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import { disconnectGoogle } from "@features/scheduling/lib/googleCalendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disconnect the Google account (S23): drops the stored connection + all event
 * mappings. Gated on the P6 flag (404) + auth middleware. We deliberately do NOT
 * delete the already-pushed events from Google on disconnect — they are the
 * owner's calendar entries to keep or remove; re-connecting starts a fresh map.
 */
export async function POST() {
  if (!schedulingP6Enabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const result = await disconnectGoogle();
  return NextResponse.json({ ok: result.ok });
}
