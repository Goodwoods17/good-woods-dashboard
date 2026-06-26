import { NextResponse, type NextRequest } from "next/server";
import { submitShareLink } from "@features/forms/lib/shareLinkServer";
import type { ShareAnswers } from "@features/forms/lib/shareLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, no-login submit endpoint for a token link. The service-role write is
 * scoped to the one instance behind the token; locked fields are stripped
 * server-side in submitShareLink (the token holder cannot edit them).
 */
/**
 * Best-effort client IP from the standard proxy headers (Vercel sets
 * x-forwarded-for / x-real-ip). Never trusted for auth — purely an audit signal.
 */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { answers?: ShareAnswers };
    const answers = body.answers ?? {};
    // Capture the audit pair server-side — never from the request body.
    const audit = {
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    };
    const result = await submitShareLink(params.token, answers, audit);
    if (!result.ok) {
      const status = result.reason === "unconfigured" ? 503 : 404;
      return NextResponse.json({ ok: false, reason: result.reason }, { status });
    }
    return NextResponse.json({ ok: true, rejectedLocked: result.rejectedLocked });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[f/submit] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
