import { NextResponse, type NextRequest } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import {
  exchangeCodeForTokens,
  qboOAuthConfigured,
  readQboOAuthEnv,
} from "@features/invoices/lib/qboOAuth";
import { saveQboConnection } from "@features/invoices/lib/qboConnectionServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gw_qbo_oauth_state";

/** Redirect back to the settings surface with a status query for the toast. */
function back(origin: string, status: string): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("qbo", status);
  return NextResponse.redirect(url);
}

/**
 * QuickBooks OAuth callback (QBO S1). Intuit redirects the (logged-in) owner
 * here with a `code`, `state`, and `realmId` (the QB company id). Gated on the
 * INVOICES_QBO flag (404) + auth middleware. Verifies the anti-CSRF state cookie,
 * exchanges the code for tokens, and stores the ENCRYPTED refresh token via
 * saveQboConnection. Never returns a token to the browser; redirects to
 * /settings with a status flag for a toast.
 */
export async function GET(request: NextRequest) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const env = readQboOAuthEnv();
  if (!qboOAuthConfigured(env)) {
    return back(origin, "unconfigured");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return back(origin, "denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const realmId = params.get("realmId");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return back(origin, "invalid_state");
  }
  if (!realmId) {
    // QBO always returns realmId on a successful authorization; its absence means
    // the company context is missing and we can't target any API calls.
    return back(origin, "no_realm");
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, origin, env });
    if (!tokens.refresh_token) {
      return back(origin, "no_refresh_token");
    }
    const result = await saveQboConnection({
      realmId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      accessTokenExpiresInSec: tokens.expires_in ?? null,
      scope: null,
      companyName: null,
      connectedBy: null,
    });
    if (!result.ok) return back(origin, "unconfigured");
  } catch (e) {
    console.error("[invoices/qbo/callback] failed:", e instanceof Error ? e.message : e);
    return back(origin, "error");
  }

  const res = back(origin, "connected");
  res.cookies.delete(STATE_COOKIE);
  return res;
}
