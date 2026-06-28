/**
 * Server-only QBO Accounting REST client (QBO-H10 consolidation, issue #193).
 *
 * Before this, every QBO I/O server hand-rolled the same request shape — the
 * environment base URL (`qboApiBaseUrl`), the `/v3/company/{realmId}/…` path,
 * the pinned `minorversion=65`, and the `Authorization: Bearer` + `Accept:
 * application/json` headers — at eight call sites across six files, each free to
 * drift on the minor version or forget a header. This centralizes that one
 * request shape so a QBO API change is a one-line edit here.
 *
 * Behaviour-preserving: `qboFetch` returns the raw `Response` so each caller
 * keeps its own status handling (throw vs. typed result vs. 404-is-gone). Two
 * thin conveniences sit on top — `qboQuery` (GET the query endpoint, throw on a
 * non-2xx) and `qboMutate` (POST a JSON body) — for the common cases.
 *
 * SERVICE-ROLE only; imported exclusively by the QBO `*Server.ts` files. Plain
 * `fetch` (no SDK), so a stubbed global `fetch` exercises it in tests.
 */
import { qboApiBaseUrl, type QboEnvironment } from "./qboOAuth";

/**
 * The QBO Accounting API minor version pinned across every data call. Bumping
 * the API contract is now a single edit here instead of eight scattered `65`s.
 */
export const QBO_MINOR_VERSION = "65";

/** The connection context every QBO data call needs. */
export type QboCallContext = {
  accessToken: string;
  realmId: string;
  environment: QboEnvironment;
};

type QboUrlParams = {
  environment: QboEnvironment;
  realmId: string;
  /** Path under `/v3/company/{realmId}/` — e.g. `query`, `bill`, `bill/123`, `upload`. */
  path: string;
  /** Extra query params merged AFTER the pinned `minorversion`. */
  query?: Record<string, string>;
};

/**
 * Build a fully-qualified QBO Accounting API URL: environment base host +
 * `/v3/company/{realmId}/{path}` + `minorversion` + any extra query params.
 *
 * Uses `encodeURIComponent` (space → `%20`) to match the hand-rolled URLs the
 * servers built before this consolidation.
 */
export function qboUrl({ environment, realmId, path, query }: QboUrlParams): string {
  const base = qboApiBaseUrl(environment);
  const params: Record<string, string> = { minorversion: QBO_MINOR_VERSION, ...query };
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}/v3/company/${realmId}/${path}?${qs}`;
}

export type QboFetchParams = QboUrlParams & {
  accessToken: string;
  method?: "GET" | "POST";
  /**
   * Request body. A `string` body is sent as `application/json`; a `FormData`
   * body is left alone so `fetch` sets the multipart boundary itself (the QBO
   * `/upload` attachable endpoint relies on this).
   */
  body?: string | FormData;
};

/**
 * The one QBO request seam: builds the URL + the `Bearer` / `Accept` headers
 * (and `Content-Type: application/json` for a string body) and returns the raw
 * `Response`. Callers own the status handling.
 */
export function qboFetch({
  accessToken,
  method = "GET",
  body,
  ...urlParams
}: QboFetchParams): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (typeof body === "string") headers["Content-Type"] = "application/json";
  return fetch(qboUrl(urlParams), { method, headers, body });
}

/**
 * GET the QBO query endpoint and return the parsed JSON body. Throws on a
 * non-2xx response with a `"{label} failed: {status} {statusText}"` message so
 * callers can keep their existing error text via `label`.
 */
export async function qboQuery(
  ctx: QboCallContext,
  query: string,
  label = "QBO query"
): Promise<unknown> {
  const res = await qboFetch({ ...ctx, path: "query", query: { query } });
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * POST a JSON body to a QBO entity endpoint and return the raw `Response`.
 * Callers decide how to read it (throw, typed result, parse). `query` carries
 * any extra params such as `operation=delete` or a `requestid` idempotency key.
 */
export function qboMutate(
  ctx: QboCallContext,
  path: string,
  body: Record<string, unknown>,
  query?: Record<string, string>
): Promise<Response> {
  return qboFetch({ ...ctx, path, query, method: "POST", body: JSON.stringify(body) });
}
