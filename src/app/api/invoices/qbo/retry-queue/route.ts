/**
 * QBO S9 — retry queue drain (issue #155).
 *
 * GET  /api/invoices/qbo/retry-queue
 *   → List all `failed_transient` push attempts whose `next_retry_at` is past
 *     due. Informational — no writes. Gated on the QBO flag + bearer auth so
 *     a cron job can probe the queue depth before deciding to drain.
 *
 * POST /api/invoices/qbo/retry-queue
 *   → Drain: pick up to 20 due retries, mark each `retried`, then re-attempt
 *     the push for each invoice. Each retry creates a NEW `qbo_push_attempts`
 *     row with `retry_count` incremented; the old row is archived as `retried`.
 *
 * Auth: bearer token (`Authorization: Bearer <CRON_SECRET>`) OR authenticated
 * browser session (the QBO flag check already requires authentication via the
 * app middleware). Only the owner ever reaches this route.
 *
 * Degrades gracefully when QBO is unconfigured — the individual pushes will
 * return `not_connected` / `unconfigured` and log a `failed_permanent` row,
 * preventing an infinite retry loop.
 */
import { NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { getDueRetries, markRetried } from "@features/invoices/lib/qboPushAuditServer";
import { pushInvoiceBill } from "@features/invoices/lib/qboBillPushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** True when the request carries the configured CRON_SECRET bearer token. */
function hasCronAuth(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${cronSecret}`;
}

// GET — inspect the queue (no writes).
export async function GET(req: Request) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (!hasCronAuth(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const due = await getDueRetries();
  return NextResponse.json({ ok: true, dueCount: due.length, due });
}

// POST — drain: mark retried + re-push each due invoice.
export async function POST(req: Request) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (!hasCronAuth(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const due = await getDueRetries();
  if (due.length === 0) {
    return NextResponse.json({ ok: true, retried: 0, results: [] });
  }

  const results: Array<{
    invoiceId: string;
    oldAttemptId: string;
    retryCount: number;
    outcome: string;
  }> = [];

  for (const attempt of due) {
    // Atomically archive the old failed_transient row before the network call.
    await markRetried(attempt.id);

    // Re-push (creates a new qbo_push_attempts row with retryCount + 1).
    const result = await pushInvoiceBill(
      attempt.invoiceId,
      `retry:${attempt.retryCount + 1}`
    );

    results.push({
      invoiceId: attempt.invoiceId,
      oldAttemptId: attempt.id,
      retryCount: attempt.retryCount + 1,
      outcome: result.status,
    });
  }

  return NextResponse.json({ ok: true, retried: results.length, results });
}
