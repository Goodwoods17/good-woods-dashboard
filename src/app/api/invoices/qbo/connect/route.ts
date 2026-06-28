import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { buildAuthUrl, qboOAuthConfigured, readQboOAuthEnv } from "@features/invoices/lib/qboOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gw_qbo_oauth_state";

/**
 * Kick off the QuickBooks user-consent OAuth flow (QBO S1). Gated on the
 * INVOICES_QBO flag (404 when off) and the auth middleware. When the OAuth creds
 * are absent it degrades to 503 `unconfigured` (mirrors the Google connect
 * route) so nothing crashes in CI / preview / unconfigured prod. Otherwise it
 * sets a short-lived anti-CSRF `state` cookie and 302-redirects to Intuit's
 * consent screen (single accounting scope).
 */
export async function GET(request: NextRequest) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const env = readQboOAuthEnv();
  if (!qboOAuthConfigured(env)) {
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
