/**
 * QBO S7 — push a posted invoice to QuickBooks as a Bill (issue #153).
 *
 * GET  /api/invoices/[id]/push-qbo  → PREVIEW (no write): the built Bill + total
 *   reconciliation + the block-until-mapped gate + current push status. Powers
 *   the "Send to QuickBooks" preview/confirm panel and the pushed/not-pushed
 *   badge on the invoice detail page.
 *
 * POST /api/invoices/[id]/push-qbo  → CONFIRM + push. Idempotent: a second call
 *   creates nothing (local link short-circuit + query-before-create); an
 *   unmapped or non-posted invoice is refused (409) with the gate's reason.
 *
 * Gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` (404 when off) + the app's auth
 * middleware (owner-only), exactly like the QBO S3/S4 routes. Degrades cleanly
 * (400/503, never a 5xx crash, never a token leak) when QBO is unconfigured.
 */
import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { previewInvoicePush, pushInvoiceBill } from "@features/invoices/lib/qboBillPushServer";
import { getAuthedUserId } from "@shared/lib/authedUserServer";

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

// GET — read-only preview (bill + gate + current status).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (!params.id) {
    return NextResponse.json({ ok: false, reason: "missing_id" }, { status: 400 });
  }

  const preview = await previewInvoicePush(params.id);
  if (preview.status !== "ok") {
    // QBO-H7 (#190): surface the latest attempt even when not connected, so a
    // prior failed push stays visible (distinct from never-sent) regardless of
    // the current token state.
    return NextResponse.json(
      { ok: false, reason: preview.status, latestAttempt: preview.latestAttempt },
      { status: statusForReason(preview.status) }
    );
  }
  return NextResponse.json({ ok: true, ...preview });
}

// POST — confirm + push (idempotent create).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (!params.id) {
    return NextResponse.json({ ok: false, reason: "missing_id" }, { status: 400 });
  }

  // QBO-H5: record WHO triggered this push on the audit row (issue #188).
  const pushedBy = await getAuthedUserId();
  const result = await pushInvoiceBill(params.id, pushedBy);

  switch (result.status) {
    case "pushed":
      return NextResponse.json({
        ok: true,
        status: "pushed",
        billId: result.billId,
        docNumber: result.docNumber,
        deepLink: result.deepLink,
        // Non-blocking attachment result (S8). Never omit — callers rely on its
        // presence to know whether the PDF was attached and can surface a retry.
        attachment: result.attachment,
      });
    case "already_pushed":
      return NextResponse.json({
        ok: true,
        status: "already_pushed",
        billId: result.billId,
        deepLink: result.deepLink,
      });
    case "blocked":
      // 409 Conflict: the invoice can't be pushed in its current (unmapped /
      // not-posted) state. The gate tells the UI exactly what to fix.
      return NextResponse.json(
        { ok: false, status: "blocked", gate: result.gate },
        { status: 409 }
      );
    default:
      return NextResponse.json(
        { ok: false, reason: result.status, message: result.message },
        { status: statusForReason(result.status) }
      );
  }
}
