/**
 * QBO-H7 — retry just the PDF attachment for an already-pushed Bill (issue #190).
 *
 * POST /api/invoices/[id]/attach-qbo → re-run ONLY the Attachable upload against
 *   the invoice's existing QBO Bill. The Bill push (S8) attaches the source PDF
 *   non-blockingly, so a transient attach failure leaves a real Bill with no
 *   document. Re-pushing can't fix it (the local link short-circuits), so this
 *   gives the owner a "Retry attachment" affordance that touches only the PDF.
 *
 * Gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` (404 when off) + the app's auth
 * middleware (owner-only), exactly like the push/void routes. Degrades cleanly
 * (400/503/409, never a 5xx crash, never a token leak) when QBO is unconfigured
 * or the invoice was never pushed.
 */
import { NextResponse } from "next/server";
import { requireQboEnabled, statusForReason } from "@features/invoices/lib/qboRoute";
import { reattachInvoicePdf } from "@features/invoices/lib/qboBillPushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const off = requireQboEnabled();
  if (off) return off;
  if (!params.id) {
    return NextResponse.json({ ok: false, reason: "missing_id" }, { status: 400 });
  }

  const result = await reattachInvoicePdf(params.id);

  switch (result.status) {
    case "attached":
      return NextResponse.json({ ok: true, status: "attached", attachment: result });
    case "skipped":
    case "error":
      // The Bill is fine; only the PDF failed again. Report the outcome so the
      // panel can keep the amber "didn't attach" banner up (not a 5xx).
      return NextResponse.json({ ok: false, status: result.status, attachment: result });
    case "not_pushed":
      return NextResponse.json({ ok: false, status: "not_pushed" }, { status: 409 });
    default:
      return NextResponse.json(
        { ok: false, reason: result.status, message: result.message },
        { status: statusForReason(result.status) }
      );
  }
}
