import { QUICKBOOKS_CONNECTION_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { encryptToken, decryptToken } from "./qboTokenCrypto";
import {
  qboOAuthConfigured,
  readQboOAuthEnv,
  readQboEnvironment,
  refreshAccessToken,
  type QboEnvironment,
} from "./qboOAuth";

/**
 * Server-only data access for the QuickBooks Online connection (QBO S1, issue
 * #147). SERVICE-ROLE only — imported exclusively by the /api/invoices/qbo/*
 * route handlers (runtime=nodejs). The refresh token is decrypted in memory only
 * at refresh time and never returned to any caller.
 *
 * Every entry point degrades gracefully: a missing service client, missing OAuth
 * creds, or no connection yields a typed "unconfigured" / "not_connected" result
 * rather than throwing — so CI / preview / unconfigured prod stay green. Mirrors
 * `features/scheduling/lib/googleCalendarServer.ts` (S23).
 */

type ConnectionRow = {
  id: string;
  realm_id: string;
  environment: string;
  company_name: string | null;
  encrypted_refresh_token: string;
  scope: string | null;
};

export type QboConnectionStatus = {
  /** OAuth client id/secret + token-encryption key all present. */
  configured: boolean;
  /** A connection row exists (the owner has consented). */
  connected: boolean;
  /** Display-only company name when connected. */
  companyName: string | null;
  /** Which Intuit environment the stored tokens belong to. */
  environment: QboEnvironment | null;
  /**
   * Which QBO environment this server deployment currently targets (driven by
   * QBO_ENVIRONMENT env var; "sandbox" when unset). Always returned so the UI
   * can show the right label — including BEFORE a connection is made — and so
   * the S12 go-live checklist can detect when a prod cutover is complete.
   */
  configuredEnvironment: QboEnvironment;
};

/** Status for the UI panel — never throws, never leaks the token. */
export async function getQboConnectionStatus(): Promise<QboConnectionStatus> {
  const configured = qboOAuthConfigured();
  const configuredEnvironment = readQboEnvironment();
  const sb = getServiceRoleClient();
  if (!sb)
    return {
      configured,
      connected: false,
      companyName: null,
      environment: null,
      configuredEnvironment,
    };

  const { data } = await sb
    .from(QUICKBOOKS_CONNECTION_TABLE)
    .select("company_name, environment")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    configured,
    connected: Boolean(data),
    companyName: (data?.company_name as string | null) ?? null,
    environment: (data?.environment as QboEnvironment | null) ?? null,
    configuredEnvironment,
  };
}

/** Persist (or replace) the single owner connection with an ENCRYPTED token. */
export async function saveQboConnection(params: {
  realmId: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresInSec: number | null;
  scope: string | null;
  companyName: string | null;
  connectedBy: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "unconfigured" }> {
  const encKey = process.env.QBO_TOKEN_ENC_KEY;
  const sb = getServiceRoleClient();
  if (!sb || !encKey?.trim()) return { ok: false, reason: "unconfigured" };

  const env = readQboOAuthEnv();
  const expiresAt =
    params.accessTokenExpiresInSec != null
      ? new Date(Date.now() + params.accessTokenExpiresInSec * 1000).toISOString()
      : null;

  // Single-shop model: clear any prior connection, then insert the fresh one.
  await sb.from(QUICKBOOKS_CONNECTION_TABLE).delete().neq("id", "");
  await sb.from(QUICKBOOKS_CONNECTION_TABLE).insert({
    realm_id: params.realmId,
    environment: env.environment,
    company_name: params.companyName,
    encrypted_refresh_token: encryptToken(params.refreshToken, encKey),
    encrypted_access_token: params.accessToken ? encryptToken(params.accessToken, encKey) : null,
    access_token_expires_at: expiresAt,
    scope: params.scope,
    connected_by: params.connectedBy,
  });
  return { ok: true };
}

/** Disconnect: drop the stored connection (best-effort). */
export async function disconnectQbo(): Promise<{ ok: boolean }> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false };
  await sb.from(QUICKBOOKS_CONNECTION_TABLE).delete().neq("id", "");
  return { ok: true };
}

async function loadConnection(): Promise<ConnectionRow | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const { data } = await sb
    .from(QUICKBOOKS_CONNECTION_TABLE)
    .select("id, realm_id, environment, company_name, encrypted_refresh_token, scope")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

type AccessTokenResult =
  | { ok: true; accessToken: string; realmId: string; environment: QboEnvironment }
  | { ok: false; reason: "unconfigured" | "not_connected" | "refresh_failed" };

/**
 * Mint a fresh access token for the connected company.
 *
 * Decrypts the stored refresh token, calls QBO's token endpoint, and PERSISTS
 * the (rotated) refresh token + new access token back encrypted — QBO rotates
 * the refresh token roughly every 24h, so failing to persist it would brick the
 * connection within a day. This is the "access-token refresh works" half of the
 * tracer's done-when. Never returns or logs the refresh token.
 */
export async function getFreshAccessToken(): Promise<AccessTokenResult> {
  if (!qboOAuthConfigured()) return { ok: false, reason: "unconfigured" };

  const sb = getServiceRoleClient();
  const encKey = process.env.QBO_TOKEN_ENC_KEY;
  if (!sb || !encKey?.trim()) return { ok: false, reason: "unconfigured" };

  const connection = await loadConnection();
  if (!connection) return { ok: false, reason: "not_connected" };

  let refreshToken: string;
  try {
    refreshToken = decryptToken(connection.encrypted_refresh_token, encKey);
  } catch {
    return { ok: false, reason: "unconfigured" };
  }

  const env = readQboOAuthEnv();
  let tokens;
  try {
    tokens = await refreshAccessToken({ refreshToken, env });
  } catch (e) {
    console.error("[invoices/qbo] refresh failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "refresh_failed" };
  }

  // Persist the rotated refresh token + new access token (encrypted) in place.
  const expiresAt =
    tokens.expires_in != null
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  // QBO-H11: NEVER overwrite the stored refresh token with an empty value. QBO
  // rotates the refresh token on (most) refreshes; if a response somehow omits
  // it, persisting "" would brick the connection. Keep the prior token instead
  // and alert loudly so the gap is visible in logs.
  const update: Record<string, unknown> = {
    encrypted_access_token: encryptToken(tokens.access_token, encKey),
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (tokens.refresh_token && tokens.refresh_token.trim()) {
    update.encrypted_refresh_token = encryptToken(tokens.refresh_token, encKey);
  } else {
    console.error(
      "[invoices/qbo] refresh returned NO refresh_token — keeping the prior one; " +
        "the QBO connection may expire soon and need a manual reconnect."
    );
  }

  // QBO-H11: the rotation write is not transactional with the network refresh —
  // if it fails, the freshly-rotated refresh token is lost and the next refresh
  // will fail (QBO already invalidated the old one). We can't roll back, but we
  // MUST surface it loudly rather than swallow it silently.
  const { error: updateError } = await sb
    .from(QUICKBOOKS_CONNECTION_TABLE)
    .update(update)
    .eq("id", connection.id);
  if (updateError) {
    console.error(
      "[invoices/qbo] FAILED to persist the rotated QBO token — the connection " +
        "will likely need a manual reconnect:",
      updateError.message
    );
  }

  return {
    ok: true,
    accessToken: tokens.access_token,
    realmId: connection.realm_id,
    environment: (connection.environment as QboEnvironment) || env.environment,
  };
}
