import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import {
  countUnpushedPostedInvoices,
  getQboTokenHealth,
  runBulkPush,
} from "@features/invoices/lib/qboBulkPushServer";
import { getAuthedUserId } from "@shared/lib/authedUserServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QBO S11 — bulk catch-up push + token-health probe (issue #157).
 *
 * GET  → returns the count of unpushed posted invoices + the token-health
 *        assessment.  Used to populate the bulk-push panel on the invoices
 *        list page.  Authenticated (auth middleware); 404 when flag is off.
 *
 * POST → runs the bulk push (rate-limited, capped at BULK_PUSH_MAX). Returns
 *        a summary { pushed, alreadyPushed, blocked, failed, items }.
 *        Authenticated (auth middleware) — owner-triggered action.
 *        404 when flag is off; 400 / 503 when not connected / unconfigured.
 *
 * Degrades gracefully: when QBO is unconfigured / not connected returns a
 * typed { ok: false, reason } body at 400/503 instead of crashing.
 * Never returns any token field.
 */

export async function GET() {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const [{ count, realmId }, tokenHealth] = await Promise.all([
    countUnpushedPostedInvoices(),
    getQboTokenHealth(),
  ]);

  return NextResponse.json({
    ok: true,
    count,
    realmId,
    tokenHealth,
  });
}

export async function POST() {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // QBO-H5: a bulk catch-up is still an owner action — record who ran it on
  // every attempt row (issue #188). Falls back to null only when unauthenticated.
  const pushedBy = await getAuthedUserId();
  const result = await runBulkPush({ pushedBy });

  if (!result.ok) {
    const status = result.reason === "unconfigured" ? 503 : 400;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
