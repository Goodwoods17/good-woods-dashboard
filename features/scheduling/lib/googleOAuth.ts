import { GOOGLE_CALENDAR_SCOPE } from "./googlePush";

/**
 * Server-only Google OAuth 2.0 helpers for the one-way calendar push (S23).
 *
 * User-consent OAuth (NOT service-account / domain-wide delegation): the owner
 * clicks "Connect Google", consents to the single `calendar.events` scope, and
 * we exchange the code for a refresh token (stored encrypted). All live Google
 * calls are gated on creds presence so CI / dev / unconfigured prod degrade to a
 * clean "not configured" state instead of crashing — mirrors the Resend
 * unconfigured fallback in the Forms send route.
 *
 * Plain `fetch` against Google's documented OAuth + Calendar REST endpoints — no
 * `googleapis` dependency. Imported only by server route handlers.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GoogleOAuthEnv = {
  clientId: string | undefined;
  clientSecret: string | undefined;
};

export function readGoogleOAuthEnv(): GoogleOAuthEnv {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  };
}

/**
 * True only when BOTH the client id/secret AND the token-encryption key are
 * present — all three are required to complete the flow and store the token
 * safely. Missing any → the UI shows "not configured" and live calls are skipped.
 */
export function googleOAuthConfigured(
  env: GoogleOAuthEnv = readGoogleOAuthEnv(),
  encKey: string | undefined = process.env.GOOGLE_TOKEN_ENC_KEY
): boolean {
  return Boolean(env.clientId?.trim() && env.clientSecret?.trim() && encKey?.trim());
}

/** The redirect URI Google calls back; derived from the request origin. */
export function callbackUrl(origin: string): string {
  return `${origin}/api/scheduling/google/callback`;
}

/**
 * Build the consent URL. `access_type=offline` + `prompt=consent` ensures we get
 * a refresh token. `state` is an opaque anti-CSRF nonce the caller verifies on
 * callback. Minimal scope only.
 */
export function buildAuthUrl(params: { clientId: string; origin: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: callbackUrl(params.origin),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: params.state,
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/** Exchange an authorization code for tokens. Throws on a non-OK response. */
export async function exchangeCodeForTokens(params: {
  code: string;
  origin: string;
  env: GoogleOAuthEnv;
}): Promise<TokenResponse> {
  const { code, origin, env } = params;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId ?? "",
      client_secret: env.clientSecret ?? "",
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`google token exchange failed: ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Mint a short-lived access token from the stored refresh token. */
export async function refreshAccessToken(params: {
  refreshToken: string;
  env: GoogleOAuthEnv;
}): Promise<TokenResponse> {
  const { refreshToken, env } = params;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.clientId ?? "",
      client_secret: env.clientSecret ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`google token refresh failed: ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}
