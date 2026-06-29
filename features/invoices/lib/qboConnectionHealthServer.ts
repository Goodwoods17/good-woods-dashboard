import "server-only";
/**
 * Server-only token-health probe (QBO S11 / QBO-H8). SERVICE-ROLE only.
 *
 * Reads the single quickbooks_connection row and assesses how close the
 * refresh token is to its 100-day expiry, via the pure `assessTokenHealth`.
 * Extracted from qboBulkPushServer so BOTH the bulk-push panel and the
 * per-invoice push preview (qboBillPushServer) can read it without a circular
 * import (bulk already depends on the bill-push module).
 *
 * Returns `null` when no service client is available so callers can cleanly
 * skip the health nudge. Never returns any token field.
 */
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { QUICKBOOKS_CONNECTION_TABLE } from "@shared/lib/supabase";
import { assessTokenHealth, type TokenHealth } from "./qboTokenHealth";

export async function readQboTokenHealth(): Promise<TokenHealth | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;

  const { data } = await sb
    .from(QUICKBOOKS_CONNECTION_TABLE)
    .select("updated_at, connected_at")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    // No connection row → treat as critical (worst-case is safest); the per-
    // invoice preview only surfaces the nudge once a connection exists.
    return assessTokenHealth(null);
  }

  // updated_at tracks the last token refresh (rotated on every access-token
  // refresh). Falls back to connected_at if updated_at is absent / null.
  const rawDate = (data.updated_at ?? data.connected_at) as string | null;
  const lastActivity = rawDate ? new Date(rawDate) : null;
  return assessTokenHealth(lastActivity);
}
