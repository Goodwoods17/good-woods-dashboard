import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The shared token-load head for the no-login "capability link" portals (Forms
 * `/f/<token>`, Scheduling `/s/<token>`). A tokenized share-link row IS the
 * capability: the opaque token scopes a service-role read to exactly one row.
 *
 * `loadCapabilityRow` reproduces the load flow both portals duplicated:
 *   select-by-token → revoked check → best-effort first-view stamp.
 * The caller keeps its own downstream fetch (the form instance + fields, or the
 * job schedule) and result-shape mapping unchanged. Server-only (the service
 * client it is handed must never reach the browser bundle).
 */

export type CapabilityRowResult<Row> =
  { ok: true; row: Row } | { ok: false; reason: "not_found" | "revoked" };

export type LoadCapabilityRowOptions = {
  /**
   * Stamp `viewed_at` on the FIRST open (when it is still null). True by
   * default for a real visit; pass false for background polls (e.g. a
   * subscribed ICS calendar) that must not masquerade as the client opening
   * the portal.
   */
  stampView?: boolean;
};

/**
 * Load the one share-link row behind a token. Both share-link tables
 * (`form_share_links`, `schedule_share_links`) carry `token` / `revoked_at` /
 * `viewed_at`. On DB error or a missing row → not_found. A set `revoked_at` →
 * revoked. Otherwise, when `stampView` (default true) and this is the first
 * view, best-effort stamp `viewed_at` to now — the stamp NEVER fails the load
 * (its error is ignored), and it targets the same single row by token. The
 * first-view guard preserves the original "opened date" (it is never
 * overwritten on later loads).
 */
export async function loadCapabilityRow<Row extends { revoked_at: string | null }>(
  sb: SupabaseClient,
  table: string,
  token: string,
  opts: LoadCapabilityRowOptions = {}
): Promise<CapabilityRowResult<Row>> {
  const { data, error } = await sb.from(table).select("*").eq("token", token).maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found" };

  const row = data as Row;
  if (row.revoked_at !== null) return { ok: false, reason: "revoked" };

  const stampView = opts.stampView ?? true;
  // First view stamps viewed_at (best-effort; ignore the result so a write
  // error never fails the load — matches both portals' prior behaviour).
  if (stampView && (row as unknown as { viewed_at: string | null }).viewed_at === null) {
    await sb.from(table).update({ viewed_at: new Date().toISOString() }).eq("token", token);
  }

  return { ok: true, row };
}
