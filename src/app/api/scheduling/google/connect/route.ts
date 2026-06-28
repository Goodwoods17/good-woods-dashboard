import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import {
  buildAuthUrl,
  googleOAuthConfigured,
  readGoogleOAuthEnv,
} from "@features/scheduling/lib/googleOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gw_google_oauth_state";

/**
 * Kick off the user-consent OAuth flow (S23). Gated on the P6 flag (404 when
 * off) and the auth middleware. When the OAuth creds are absent it degrades to
 * 503 `unconfigured` (mirrors the Resend fallback) so nothing crashes in CI /
 * preview / unconfigured prod. Otherwise it sets a short-lived anti-CSRF `state`
 * cookie and 302-redirects to Google's consent screen (minimal scope).
 */
export async function GET(request: NextRequest) {
  if (!schedulingP6Enabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const env = readGoogleOAuthEnv();
  if (!googleOAuthConfigured(env)) {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl({
    clientId: env.clientId!,
    origin: request.nextUrl.origin,
    state,
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
