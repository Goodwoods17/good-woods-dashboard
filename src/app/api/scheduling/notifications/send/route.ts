import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail, resolveFromAddress } from "@features/forms/lib/sendShareLink";
import { resendDeliver } from "@shared/lib/resendDeliver";
import {
  SCHEDULING_NOTIFICATIONS_TABLE,
  type NotificationRow,
} from "@features/scheduling/lib/notificationsRowMap";
import { schedulingEnabled } from "@features/scheduling/lib/featureFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only send route for approved scheduling notifications (S22, issue #110).
 * Reuses the Forms P2 Resend pattern: same RESEND_API_KEY / RESEND_FROM env
 * vars, same graceful-fallback to { ok: false, reason: "unconfigured" } when
 * the key is absent (so CI / dev never crash).
 *
 * POST body: { notificationId: string, recipientEmail: string }
 *   – Loads the pending_approval notification from scheduling_notifications.
 *   – Marks it 'approved', delivers via Resend, then marks 'sent'.
 *   – Returns 503 when RESEND_API_KEY absent; UI falls back to a copy draft.
 *
 * Gated by auth middleware (same boundary as /api/forms). Also gated on the
 * SCHEDULING_ENABLED flag at the route level — returns 404 when off.
 */
export async function POST(request: NextRequest) {
  if (!schedulingEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      notificationId?: string;
      recipientEmail?: string;
    };

    const notificationId = body.notificationId?.trim();
    const recipientEmail = body.recipientEmail?.trim() ?? "";

    if (!notificationId) {
      return NextResponse.json({ ok: false, reason: "missing_notification_id" }, { status: 400 });
    }
    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
    }

    const sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Load the notification row — must be pending_approval.
    const { data: row, error: fetchErr } = await sb
      .from(SCHEDULING_NOTIFICATIONS_TABLE)
      .select("*")
      .eq("id", notificationId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const notifRow = row as NotificationRow;
    if (notifRow.status !== "pending_approval") {
      return NextResponse.json(
        { ok: false, reason: "not_pending", currentStatus: notifRow.status },
        { status: 409 }
      );
    }

    // Stamp 'approved' before the send attempt.
    await sb
      .from(SCHEDULING_NOTIFICATIONS_TABLE)
      .update({ status: "approved", recipient_email: recipientEmail })
      .eq("id", notificationId);

    // Deliver via the shared Resend deliverer (same lazy-imported SDK seam the
    // Forms P2 send path uses). Plain text only — the scheduling notifications
    // are honest short prose, not marketing HTML. An html-first path can be
    // added later.
    const from = resolveFromAddress(process.env.RESEND_FROM);
    const { id: emailId, error: sendErr } = await resendDeliver({
      from,
      to: recipientEmail,
      subject: notifRow.subject,
      text: notifRow.body,
      html: `<div style="font-family:system-ui,sans-serif;color:#1a1a1a;line-height:1.6;white-space:pre-wrap">${notifRow.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
    });

    if (sendErr) {
      console.error("[scheduling/notifications/send] Resend error:", sendErr);
      return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 502 });
    }

    const now = new Date().toISOString();
    await sb
      .from(SCHEDULING_NOTIFICATIONS_TABLE)
      .update({
        status: "sent",
        sent_at: now,
        resend_email_id: emailId,
        recipient_email: recipientEmail,
      })
      .eq("id", notificationId);

    return NextResponse.json({ ok: true, emailId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[scheduling/notifications/send] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
