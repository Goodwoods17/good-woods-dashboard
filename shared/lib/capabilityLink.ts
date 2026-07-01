import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapabilityType } from "./types";

/**
 * The shared token-load head for the no-login "capability link" portals (Forms
 * `/f/<token>`, Scheduling `/s/<token>`, and — on the generalized `share_tokens`
 * registry, ADR 0022 — document view/upload). A tokenized share-link row IS the
 * capability: the opaque token scopes a service-role read to exactly one row.
 *
 * `loadCapabilityRow` reproduces the load flow both portals duplicated:
 *   select-by-token → (optional) capability-type assertion → revoked check →
 *   (opt-in) expiry check → best-effort first-view stamp.
 * The caller keeps its own downstream fetch (the form instance + fields, or the
 * job schedule) and result-shape mapping unchanged. Server-only (the service
 * client it is handed must never reach the browser bundle).
 */

export type CapabilityRowResult<Row> =
  { ok: true; row: Row } | { ok: false; reason: "not_found" | "revoked" | "expired" };

export type LoadCapabilityRowOptions = {
  /**
   * Stamp `viewed_at` on the FIRST open (when it is still null). True by
   * default for a real visit; pass false for background polls (e.g. a
   * subscribed ICS calendar) that must not masquerade as the client opening
   * the portal.
   */
  stampView?: boolean;
  /**
   * The capability type this caller expects (ADR 0022). On the GENERALIZED
   * `share_tokens` table every token shares one global namespace, so a `/f`
   * token query could otherwise return a `schedule` row → a wrong-type cast.
   * When set, the query is filtered to that type AND the loaded row's
   * `capability_type` is asserted before the cast — a foreign-type token reads
   * as `not_found` (never leaks that the token exists under another type).
   * Omit on the legacy per-feature tables (they have no `capability_type`).
   */
  capabilityType?: CapabilityType;
};

/**
 * Load the one share-link row behind a token. The legacy per-feature tables
 * (`form_share_links`, `schedule_share_links`) and the generalized `share_tokens`
 * table all carry `token` / `revoked_at` / `viewed_at`; `share_tokens` adds
 * `capability_type` / `expires_at`.
 *
 * On DB error or a missing row → `not_found`. When `capabilityType` is supplied,
 * the query filters on it and the loaded row's type is re-asserted (a
 * foreign-type token → `not_found`). A set `revoked_at` → `revoked`. An
 * `expires_at` in the past → `expired` (NULL / absent = never expires — opt-in).
 * Otherwise, when `stampView` (default true) and this is the first view,
 * best-effort stamp `viewed_at` to now — the stamp NEVER fails the load (its
 * error is ignored) and targets the same single row by token. The first-view
 * guard preserves the original "opened date" (never overwritten on later loads).
 */
export async function loadCapabilityRow<Row extends { revoked_at: string | null }>(
  sb: SupabaseClient,
  table: string,
  token: string,
  opts: LoadCapabilityRowOptions = {}
): Promise<CapabilityRowResult<Row>> {
  let query = sb.from(table).select("*").eq("token", token);
  // On the global share_tokens namespace, scope the read to the expected type so
  // a foreign-type token can't even be fetched (defence-in-depth with the assert
  // below). No-op on the legacy single-type tables (capabilityType omitted).
  if (opts.capabilityType) query = query.eq("capability_type", opts.capabilityType);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found" };

  const row = data as Row;

  // Type assertion before the cast: even if the filter were bypassed, a row whose
  // capability_type doesn't match reads as not_found (never a wrong-type cast).
  if (opts.capabilityType) {
    const rowType = (row as unknown as { capability_type?: string }).capability_type;
    if (rowType !== opts.capabilityType) return { ok: false, reason: "not_found" };
  }

  if (row.revoked_at !== null) return { ok: false, reason: "revoked" };

  // Opt-in expiry: NULL / absent = never. Only a row that actually carries an
  // expires_at in the past is rejected, so retrofitted no-expiry links (and the
  // legacy tables, which have no such column) are unaffected.
  const expiresAt = (row as unknown as { expires_at?: string | null }).expires_at;
  if (expiresAt != null && new Date(expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const stampView = opts.stampView ?? true;
  // First view stamps viewed_at (best-effort; ignore the result so a write
  // error never fails the load — matches both portals' prior behaviour).
  if (stampView && (row as unknown as { viewed_at: string | null }).viewed_at === null) {
    let stampQuery = sb
      .from(table)
      .update({ viewed_at: new Date().toISOString() })
      .eq("token", token);
    if (opts.capabilityType) stampQuery = stampQuery.eq("capability_type", opts.capabilityType);
    await stampQuery;
  }

  return { ok: true, row };
}
