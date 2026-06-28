/**
 * QBO S10 — un-push / void a Bill pushed to QuickBooks in error (issue #156).
 *
 * POST /api/invoices/[id]/void-qbo → CONFIRM + void. Deletes the Bill in QBO
 *   and clears the local `invoice → Bill` link so a corrected invoice can be
 *   re-pushed. Confirm-gated in the UI (a two-step "Void in QuickBooks" action);
 *   there is no GET preview — the push panel's GET already reports whether a
 *   Bill exists (alreadyPushed + billId + deepLink).
 *
 * Gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` (404 when off) + the app's auth
 * middleware (owner-only), exactly like the QBO push route. Degrades cleanly
 * (400/503/409, never a 5xx crash, never a token leak) when QBO is unconfigured
 * or the invoice was never pushed.
 */
import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { voidInvoiceBill } from "@features/invoices/lib/qboVoidServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusForReason(reason: string): number {
  switch (reason) {
    case "unconfigured":
      return 503;
    case "not_connected":
      return 400;
    case "not_found":
      return 404;
    case "qbo_error":
      return 502;
    default:
      return 400;
  }
}

// POST — confirm + void (guarded reversal).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (!params.id) {
    return NextResponse.json({ ok: false, reason: "missing_id" }, { status: 400 });
  }

  const result = await voidInvoiceBill(params.id);

  switch (result.status) {
    case "voided":
      return NextResponse.json({
        ok: true,
        status: "voided",
        billId: result.billId,
        deepLink: result.deepLink,
      });
    case "not_pushed":
      // 409 Conflict: nothing has been pushed, so there's nothing to void.
      return NextResponse.json(
        { ok: false, status: "not_pushed", gate: result.gate },
        { status: 409 }
      );
    default:
      return NextResponse.json(
        { ok: false, reason: result.status, message: result.message },
        { status: statusForReason(result.status) }
      );
  }
}
