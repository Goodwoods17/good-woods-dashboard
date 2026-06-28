/**
 * `withQboToken` — the shared QBO token bootstrap (QBO-H10 consolidation, #193).
 *
 * Five QBO I/O servers opened with the identical five lines: mint a fresh access
 * token, and on failure collapse the reason to a typed `unconfigured` /
 * `not_connected` result (QBO rotates the refresh token ~daily, so a
 * `refresh_failed` is surfaced as `not_connected` — the connection needs
 * re-consent). This wraps that once so the servers read as "do the work with a
 * token, or short-circuit cleanly".
 *
 * SERVICE-ROLE only (it calls `getFreshAccessToken`); imported by the QBO
 * `*Server.ts` files.
 */
import { getFreshAccessToken } from "./qboConnectionServer";
import type { QboEnvironment } from "./qboOAuth";

/** The connection context a QBO data call runs against. */
export type QboToken = {
  accessToken: string;
  realmId: string;
  environment: QboEnvironment;
};

/** The two bootstrap-failure reasons every QBO server path collapses to. */
export type QboBootstrapReason = "unconfigured" | "not_connected";

/** A short-circuit result returned when no usable token could be minted. */
export type QboBootstrapFailure = { status: QboBootstrapReason };

/**
 * Run `fn` with a fresh QBO access token, or short-circuit to a typed
 * `{ status: "unconfigured" | "not_connected" }` when none can be minted.
 *
 * `unconfigured` means creds/enc-key are absent; anything else (no connection
 * row, or a failed refresh that needs re-consent) collapses to `not_connected`
 * — exactly the mapping the servers hand-rolled before this consolidation.
 */
export async function withQboToken<T>(
  fn: (token: QboToken) => Promise<T>
): Promise<T | QboBootstrapFailure> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return { status: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected" };
  }
  const { accessToken, realmId, environment } = tokenResult;
  return fn({ accessToken, realmId, environment });
}
