import { NextResponse, type NextRequest } from "next/server";
import { sendShareLinkEmail } from "@features/forms/lib/sendShareLinkServer";
import { isValidEmail, type SendMode } from "@features/forms/lib/sendShareLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only manual send for a share link (Forms P2 · Slice 5, issue #44).
 * Gated by the auth middleware (every /api/forms route requires a logged-in
 * user — the same boundary that protects the rest of the app). The actual send
 * + sent_at stamp runs service-side in sendShareLinkEmail.
 *
 * Returns 503 { reason: "unconfigured" } when RESEND_API_KEY is absent (preview /
 * dev / CI) — the UI reads that and falls back to the mailto/copy flow. Never
 * crashes, never sends a real email in CI (the SDK is only constructed when a key
 * is present, and tests mock the deliverer).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      recipientEmail?: string;
      mode?: SendMode;
    };
    const recipientEmail = (body.recipientEmail ?? "").trim();
    const mode: SendMode = body.mode === "reminder" ? "reminder" : "send";

    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
    }

    // The server module loads the link (and thus the token) and builds
    // /f/<token> from this origin, so the email link matches whatever host the
    // owner is on (prod / preview / local).
    const result = await sendShareLinkEmail({
      linkId: params.id,
      recipientEmail,
      mode,
      origin: request.nextUrl.origin,
    });

    if (!result.ok) {
      const status =
        result.reason === "unconfigured"
          ? 503
          : result.reason === "invalid_email"
            ? 400
            : result.reason === "not_found"
              ? 404
              : result.reason === "revoked"
                ? 409
                : 502;
      return NextResponse.json({ ok: false, reason: result.reason }, { status });
    }

    return NextResponse.json({ ok: true, mode: result.mode, emailId: result.emailId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[forms/share-links/send] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
