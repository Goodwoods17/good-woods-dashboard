/**
 * Server-only QuickBooks Online (QBO) OAuth 2.0 helpers for the connection
 * tracer (QBO S1, issue #147).
 *
 * User-consent OAuth: the owner clicks "Connect QuickBooks", consents to the
 * single `com.intuit.quickbooks.accounting` scope, and we exchange the code for
 * an access token + a long-lived refresh token (stored encrypted). QBO ROTATES
 * the refresh token roughly every 24h, so the latest one is persisted on every
 * refresh call — see `qboConnectionServer.ts`.
 *
 * All live QBO calls are gated on creds presence so CI / dev / unconfigured prod
 * degrade to a clean "not configured" state instead of crashing — mirrors the
 * Google OAuth fallback in `features/scheduling/lib/googleOAuth.ts`.
 *
 * Two QBO-specific quirks vs. the Google flow:
 *   1. The token endpoint authenticates the CLIENT via HTTP Basic auth
 *      (base64 `clientId:clientSecret`), not body params.
 *   2. The data API host differs between the sandbox and production companies;
 *      this tracer targets the SANDBOX by default (`QBO_ENVIRONMENT`).
 *
 * Plain `fetch` against Intuit's documented OAuth endpoints — no `intuit-oauth`
 * dependency. Imported only by server route handlers (runtime=nodejs).
 */

const AUTH_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** The single accounting scope this tracer requests (least privilege). */
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

/** Sandbox vs. production QBO Accounting API base host (data calls, not OAuth). */
export const QBO_SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
export const QBO_PRODUCTION_API_BASE = "https://quickbooks.api.intuit.com";

export type QboEnvironment = "sandbox" | "production";

export type QboOAuthEnv = {
  clientId: string | undefined;
  clientSecret: string | undefined;
  environment: QboEnvironment;
};

/** Normalize the QBO_ENVIRONMENT env var; anything but "production" = sandbox. */
export function readQboEnvironment(
  raw: string | undefined = process.env.QBO_ENVIRONMENT
): QboEnvironment {
  return raw?.trim().toLowerCase() === "production" ? "production" : "sandbox";
}

export function readQboOAuthEnv(): QboOAuthEnv {
  return {
    clientId: process.env.QBO_OAUTH_CLIENT_ID,
    clientSecret: process.env.QBO_OAUTH_CLIENT_SECRET,
    environment: readQboEnvironment(),
  };
}

/**
 * True only when BOTH the client id/secret AND the token-encryption key are
 * present — all three are required to complete the flow and store the token
 * safely. Missing any → the UI shows "not configured" and live calls are skipped.
 */
export function qboOAuthConfigured(
  env: QboOAuthEnv = readQboOAuthEnv(),
  encKey: string | undefined = process.env.QBO_TOKEN_ENC_KEY
): boolean {
  return Boolean(env.clientId?.trim() && env.clientSecret?.trim() && encKey?.trim());
}

/** The QBO Accounting API base host for the configured environment. */
export function qboApiBaseUrl(environment: QboEnvironment): string {
  return environment === "production" ? QBO_PRODUCTION_API_BASE : QBO_SANDBOX_API_BASE;
}

/** The redirect URI Intuit calls back; derived from the request origin. */
export function callbackUrl(origin: string): string {
  return `${origin}/api/invoices/qbo/callback`;
}

/** HTTP Basic credential for the token endpoint (base64 `clientId:clientSecret`). */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/**
 * Build the consent URL. `response_type=code` + the single accounting scope; QBO
 * returns a refresh token by default (no offline-access flag needed). `state` is
 * an opaque anti-CSRF nonce the caller verifies on callback.
 */
export function buildAuthUrl(params: { clientId: string; origin: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: callbackUrl(params.origin),
    response_type: "code",
    scope: QBO_ACCOUNTING_SCOPE,
    state: params.state,
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export type QboTokenResponse = {
  access_token: string;
  refresh_token: string;
  /** Access-token lifetime in seconds (≈ 3600). */
  expires_in?: number;
  /** Refresh-token lifetime in seconds (≈ 100 days; rotates ~daily). */
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

/** Exchange an authorization code for tokens. Throws on a non-OK response. */
export async function exchangeCodeForTokens(params: {
  code: string;
  origin: string;
  env: QboOAuthEnv;
}): Promise<QboTokenResponse> {
  const { code, origin, env } = params;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(env.clientId ?? "", env.clientSecret ?? ""),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(origin),
    }),
  });
  if (!res.ok) {
    throw new Error(`qbo token exchange failed: ${res.status}`);
  }
  return (await res.json()) as QboTokenResponse;
}

/**
 * Mint a fresh access token from the stored refresh token. QBO returns a
 * (usually rotated) refresh token in the SAME response — the caller MUST persist
 * it (encrypted) so the next refresh uses the current credential.
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  env: QboOAuthEnv;
}): Promise<QboTokenResponse> {
  const { refreshToken, env } = params;
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(env.clientId ?? "", env.clientSecret ?? ""),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`qbo token refresh failed: ${res.status}`);
  }
  return (await res.json()) as QboTokenResponse;
}
