import "server-only";
/**
 * Server-only I/O for QBO S11 — bulk catch-up push + token-health probe
 * (issue #157). SERVICE-ROLE only; never import from a client component.
 *
 * Finds all posted invoices that haven't been pushed to QuickBooks yet and
 * pushes them one-by-one with a rate-limit-aware delay. Also exposes a
 * token-health probe that reads the connection's last-activity timestamp and
 * assesses whether the refresh token is nearing expiry.
 *
 * Every entry point degrades gracefully when QBO is unconfigured / not
 * connected (typed result, never a throw) — mirrors qboBillPushServer.ts.
 */
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { QUICKBOOKS_LINKS_TABLE } from "@shared/lib/supabase";
import { getFreshAccessToken } from "./qboConnectionServer";
import { pushInvoiceBill } from "./qboBillPushServer";
import { readQboTokenHealth } from "./qboConnectionHealthServer";
import { type TokenHealth } from "./qboTokenHealth";
import {
  BULK_PUSH_DELAY_MS,
  BULK_PUSH_MAX,
  summarizeBulkPush,
  type BulkPushItem,
  type BulkPushSummary,
} from "./qboBulkPush";

// ---------------------------------------------------------------------------
// Token-health probe
// ---------------------------------------------------------------------------

/**
 * Read the connection row and assess the refresh-token health.
 *
 * Returns `null` when the QBO flag is off / no service client is available
 * so callers can cleanly skip the health check.
 */
export async function getQboTokenHealth(): Promise<TokenHealth | null> {
  return readQboTokenHealth();
}

// ---------------------------------------------------------------------------
// Unpushed posted invoice queries
// ---------------------------------------------------------------------------

/**
 * Return the IDs of posted invoices that have no QuickBooks Bill link in
 * the connected realm — i.e., the catch-up backlog.
 *
 * Falls back to [] when the QBO connection is missing / unconfigured so
 * callers never crash.
 */
export async function getUnpushedPostedInvoiceIds(
  realmId: string,
  limit = BULK_PUSH_MAX
): Promise<string[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  // Fetch all invoice IDs that already have a Bill link for this realm.
  const { data: linked } = await sb
    .from(QUICKBOOKS_LINKS_TABLE)
    .select("local_id")
    .eq("realm_id", realmId)
    .eq("local_type", "invoice")
    .eq("qbo_type", "Bill");

  const pushedIds = new Set<string>((linked ?? []).map((r: { local_id: string }) => r.local_id));

  // Fetch the oldest posted invoices first (fair FIFO catch-up order).
  const { data: posted } = await sb
    .from("invoices")
    .select("id")
    .eq("status", "posted")
    .order("created_at", { ascending: true })
    .limit(limit * 3); // over-fetch so we have enough after filtering

  const ids: string[] = [];
  for (const row of (posted ?? []) as { id: string }[]) {
    if (!pushedIds.has(row.id)) {
      ids.push(row.id);
      if (ids.length >= limit) break;
    }
  }
  return ids;
}

/**
 * Count of posted invoices with no QBO Bill link for the connected realm.
 * Returns 0 when QBO is unconfigured / not connected.
 */
export async function countUnpushedPostedInvoices(): Promise<{
  count: number;
  realmId: string | null;
}> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) return { count: 0, realmId: null };

  const ids = await getUnpushedPostedInvoiceIds(tokenResult.realmId, BULK_PUSH_MAX);
  return { count: ids.length, realmId: tokenResult.realmId };
}

// ---------------------------------------------------------------------------
// Bulk push orchestrator
// ---------------------------------------------------------------------------

type RunBulkPushParams = {
  /** User who triggered the bulk push (email or id), or null for automated runs. */
  pushedBy: string | null;
  /** Override the inter-push delay for tests (default: BULK_PUSH_DELAY_MS). */
  rateLimitMs?: number;
};

type RunBulkPushResult =
  { ok: true; summary: BulkPushSummary } | { ok: false; reason: "not_connected" | "unconfigured" };

/**
 * Push all eligible posted invoices to QBO in one batch.
 *
 * Rate-limited: waits `rateLimitMs` between each push (default 500 ms).
 * Capped at BULK_PUSH_MAX per run.
 *
 * Idempotent: already-pushed invoices are detected by the per-invoice
 * `pushInvoiceBill` → returned as "already_pushed", not counted as fresh pushes.
 *
 * Returns a typed result — never throws — so the API route can return a clean
 * 200/400 without a 500.
 */
export async function runBulkPush({
  pushedBy,
  rateLimitMs = BULK_PUSH_DELAY_MS,
}: RunBulkPushParams): Promise<RunBulkPushResult> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return {
      ok: false,
      reason: tokenResult.reason === "unconfigured" ? "unconfigured" : "not_connected",
    };
  }

  const ids = await getUnpushedPostedInvoiceIds(tokenResult.realmId);
  const items: BulkPushItem[] = [];

  for (let i = 0; i < ids.length; i++) {
    const invoiceId = ids[i];

    const result = await pushInvoiceBill(invoiceId, pushedBy);

    let item: BulkPushItem;
    switch (result.status) {
      case "pushed":
        item = { invoiceId, outcome: "pushed", billId: result.billId };
        break;
      case "already_pushed":
        item = { invoiceId, outcome: "already_pushed", billId: result.billId };
        break;
      case "blocked":
        item = {
          invoiceId,
          outcome: "blocked",
          message: result.gate.block ?? "blocked",
        };
        break;
      default:
        item = { invoiceId, outcome: "error", message: result.message ?? result.status };
        break;
    }

    items.push(item);

    // Rate-limit: pause between pushes (skip the delay after the last item).
    if (i < ids.length - 1 && rateLimitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, rateLimitMs));
    }
  }

  return { ok: true, summary: summarizeBulkPush(items) };
}
