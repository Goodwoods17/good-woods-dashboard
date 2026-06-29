import "server-only";
/**
 * Server-only I/O for QBO S9 — push audit log + retry queue (issue #155).
 * SERVICE-ROLE only; never import from a client component.
 *
 * Reads from / writes to `qbo_push_attempts`. Pure helpers (backoff math,
 * status classification) live in `qboPushAudit.ts`.
 */
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import type { PushAttemptStatus, PushAttemptRow, LatestPushAttempt } from "./qboPushAudit";

// ── Insert helpers ─────────────────────────────────────────────────────────────

export type PushAttemptInsert = {
  invoiceId: string;
  status: PushAttemptStatus;
  /** Which QBO Bill operation this records: 'push' (default) or 'void' (S10). */
  kind?: "push" | "void";
  qboBillId?: string | null;
  requestBody?: Record<string, unknown> | null;
  responseBody?: unknown;
  errorMessage?: string | null;
  httpStatus?: number | null;
  retryCount?: number;
  nextRetryAt?: string | null;
  pushedBy?: string | null;
  realmId?: string | null;
  environment?: string | null;
};

/** Write one push-attempt row. Returns the new row's id, or null on failure. */
export async function logPushAttempt(insert: PushAttemptInsert): Promise<string | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("qbo_push_attempts")
    .insert({
      invoice_id: insert.invoiceId,
      status: insert.status,
      kind: insert.kind ?? "push",
      qbo_bill_id: insert.qboBillId ?? null,
      request_body: insert.requestBody ?? null,
      response_body: insert.responseBody != null ? (insert.responseBody as object) : null,
      error_message: insert.errorMessage ?? null,
      http_status: insert.httpStatus ?? null,
      retry_count: insert.retryCount ?? 0,
      next_retry_at: insert.nextRetryAt ?? null,
      pushed_by: insert.pushedBy ?? null,
      realm_id: insert.realmId ?? null,
      environment: insert.environment ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Non-fatal: audit failure must not prevent the push from being reported.
    console.error("[qboPushAuditServer] logPushAttempt failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

// ── Update helpers ─────────────────────────────────────────────────────────────

export type PushAttemptUpdate = Partial<{
  status: PushAttemptStatus;
  qboBillId: string | null;
  responseBody: unknown;
  errorMessage: string | null;
  httpStatus: number | null;
  nextRetryAt: string | null;
}>;

/** Update an existing push-attempt row (e.g. after the QBO call returns). */
export async function updatePushAttempt(id: string, update: PushAttemptUpdate): Promise<void> {
  const sb = getServiceRoleClient();
  if (!sb || !id) return;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.status !== undefined) patch.status = update.status;
  if (update.qboBillId !== undefined) patch.qbo_bill_id = update.qboBillId;
  if (update.responseBody !== undefined)
    patch.response_body = update.responseBody != null ? (update.responseBody as object) : null;
  if (update.errorMessage !== undefined) patch.error_message = update.errorMessage;
  if (update.httpStatus !== undefined) patch.http_status = update.httpStatus;
  if (update.nextRetryAt !== undefined) patch.next_retry_at = update.nextRetryAt;

  const { error } = await sb.from("qbo_push_attempts").update(patch).eq("id", id);
  if (error) {
    console.error("[qboPushAuditServer] updatePushAttempt failed:", error.message);
  }
}

// ── Query helpers ──────────────────────────────────────────────────────────────

function rowToPushAttemptRow(row: Record<string, unknown>): PushAttemptRow {
  return {
    id: row.id as string,
    invoiceId: row.invoice_id as string,
    status: row.status as PushAttemptStatus,
    retryCount: (row.retry_count as number) ?? 0,
    nextRetryAt: (row.next_retry_at as string | null) ?? null,
    pushedBy: (row.pushed_by as string | null) ?? null,
    realmId: (row.realm_id as string | null) ?? null,
    environment: (row.environment as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Full audit trail for one invoice, newest first. */
export async function getPushAttempts(invoiceId: string): Promise<PushAttemptRow[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("qbo_push_attempts")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[qboPushAuditServer] getPushAttempts failed:", error.message);
    return [];
  }
  return ((data as Record<string, unknown>[]) ?? []).map(rowToPushAttemptRow);
}

/**
 * The single most-recent PUSH attempt for an invoice (kind = 'push'), distilled
 * for the push panel (QBO-H7, #190). Connection-independent — read with the
 * service role so a prior failure stays visible even when the QBO token is
 * currently unconfigured/disconnected. Void attempts are excluded.
 */
export async function getLatestPushAttempt(invoiceId: string): Promise<LatestPushAttempt | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("qbo_push_attempts")
    .select("status, next_retry_at, error_message, created_at")
    .eq("invoice_id", invoiceId)
    .eq("kind", "push")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    status: row.status as PushAttemptStatus,
    nextRetryAt: (row.next_retry_at as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Return all `failed_transient` rows whose `next_retry_at` is at or before now
 * (i.e. ready to be retried). Ordered by `next_retry_at` ascending so the
 * oldest scheduled retry runs first. Capped at 20 rows per drain cycle to avoid
 * hammering QBO if many invoices fail at once.
 */
export async function getDueRetries(limit = 20): Promise<PushAttemptRow[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("qbo_push_attempts")
    .select("*")
    .eq("status", "failed_transient")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[qboPushAuditServer] getDueRetries failed:", error.message);
    return [];
  }
  return ((data as Record<string, unknown>[]) ?? []).map(rowToPushAttemptRow);
}

/** Mark a `failed_transient` row as `retried` so the drain won't pick it up again. */
export async function markRetried(id: string): Promise<void> {
  const sb = getServiceRoleClient();
  if (!sb || !id) return;

  const { error } = await sb
    .from("qbo_push_attempts")
    .update({ status: "retried", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "failed_transient"); // guard: only transition from the expected state

  if (error) {
    console.error("[qboPushAuditServer] markRetried failed:", error.message);
  }
}
