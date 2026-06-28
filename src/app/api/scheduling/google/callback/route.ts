import { NextResponse, type NextRequest } from "next/server";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import {
  exchangeCodeForTokens,
  googleOAuthConfigured,
  readGoogleOAuthEnv,
} from "@features/scheduling/lib/googleOAuth";
import { saveGoogleConnection } from "@features/scheduling/lib/googleCalendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gw_google_oauth_state";

/** Redirect back to the settings surface with a status query for the toast. */
function back(origin: string, status: string): NextResponse {
  const url = new URL("/settings", origin);
  url.searchParams.set("google", status);
  return NextResponse.redirect(url);
}

/**
 * OAuth callback (S23). Google redirects the (logged-in) owner here with a code.
 * Gated on the P6 flag (404) + auth middleware. Verifies the anti-CSRF state
 * cookie, exchanges the code for tokens, and stores the ENCRYPTED refresh token
 * via saveGoogleConnection. Never returns the token to the browser; redirects
 * to /settings with a status flag for a toast.
 */
export async function GET(request: NextRequest) {
  if (!schedulingP6Enabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const env = readGoogleOAuthEnv();
  if (!googleOAuthConfigured(env)) {
    return back(origin, "unconfigured");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return back(origin, "denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return back(origin, "invalid_state");
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, origin, env });
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent; prompt=consent
      // forces it, but guard anyway.
      return back(origin, "no_refresh_token");
    }
    const result = await saveGoogleConnection({
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? null,
      accountEmail: null,
      connectedBy: null,
    });
    if (!result.ok) return back(origin, "unconfigured");
  } catch (e) {
    console.error("[scheduling/google/callback] failed:", e instanceof Error ? e.message : e);
    return back(origin, "error");
  }

  const res = back(origin, "connected");
  res.cookies.delete(STATE_COOKIE);
  return res;
}
