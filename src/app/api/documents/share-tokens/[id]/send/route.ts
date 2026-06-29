import { NextResponse, type NextRequest } from "next/server";
import { sendDocumentShareLinkEmail } from "@features/documents/lib/documentSendShareLinkServer";
import { isValidEmail } from "@features/documents/lib/documentSendShareLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only manual send for a document share link (S3, ADR 0022 ·
 * milestone #12). Gated by the auth middleware (every /api route requires a
 * logged-in user). The actual send + state.sentAt stamp run service-side in
 * sendDocumentShareLinkEmail.
 *
 * Returns 503 { reason: "unconfigured" } when RESEND_API_KEY is absent
 * (preview / dev / CI) — the UI reads that and falls back to the mailto/copy
 * flow. Never crashes, never sends a real email in CI (the SDK is only
 * constructed when a key is present, and tests mock the deliverer).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      recipientEmail?: string;
    };
    const recipientEmail = (body.recipientEmail ?? "").trim();

    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
    }

    // The server module loads the token and builds /d/<token> from this origin,
    // so the email link matches whatever host the owner is on (prod/preview/local).
    const result = await sendDocumentShareLinkEmail({
      shareTokenId: params.id,
      recipientEmail,
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

    return NextResponse.json({ ok: true, emailId: result.emailId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[documents/share-tokens/send] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
