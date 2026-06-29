import "server-only";
import { QUICKBOOKS_LINKS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import {
  rowToLink,
  linkToInsert,
  type QuickbooksLink,
  type QuickbooksLinkInput,
  type QuickbooksLinkRow,
} from "./quickbooksLinks";

/**
 * Server-only data access for the central QuickBooks links table (QBO S2, issue
 * #148). SERVICE-ROLE only — imported exclusively by the /api/invoices/qbo/*
 * route handlers (runtime=nodejs) and future sync tasks.
 *
 * Every entry point degrades gracefully: a missing service client yields a typed
 * "unconfigured" result (or null/empty) rather than throwing — so CI / preview /
 * unconfigured prod stay green. Mirrors `qboConnectionServer.ts` (S1).
 */

const SELECT_COLS = "id, local_type, local_id, qbo_type, qbo_id, realm_id, environment, synced_at";

/** Read the QBO link for one local entity in one company, or null if unmapped. */
export async function getQuickbooksLink(params: {
  realmId: string;
  localType: string;
  localId: string;
}): Promise<QuickbooksLink | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;

  const { data } = await sb
    .from(QUICKBOOKS_LINKS_TABLE)
    .select(SELECT_COLS)
    .eq("realm_id", params.realmId)
    .eq("local_type", params.localType)
    .eq("local_id", params.localId)
    .maybeSingle();

  return data ? rowToLink(data as QuickbooksLinkRow) : null;
}

/** List every link of a given local kind for a company (e.g. all invoices). */
export async function listQuickbooksLinks(params: {
  realmId: string;
  localType?: string;
}): Promise<QuickbooksLink[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  let query = sb.from(QUICKBOOKS_LINKS_TABLE).select(SELECT_COLS).eq("realm_id", params.realmId);
  if (params.localType) query = query.eq("local_type", params.localType);

  const { data } = await query.order("created_at", { ascending: false });
  return (data ?? []).map((r) => rowToLink(r as QuickbooksLinkRow));
}

/**
 * Create or replace the link for one local entity (upsert on the
 * (realm_id, local_type, local_id) unique key). Stamps updated_at + synced_at.
 */
export async function upsertQuickbooksLink(
  input: QuickbooksLinkInput & { createdBy?: string | null }
): Promise<{ ok: true; link: QuickbooksLink } | { ok: false; reason: "unconfigured" }> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const row = {
    ...linkToInsert(input),
    synced_at: input.syncedAt ?? new Date().toISOString(),
    created_by: input.createdBy ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data } = await sb
    .from(QUICKBOOKS_LINKS_TABLE)
    .upsert(row, { onConflict: "realm_id,local_type,local_id" })
    .select(SELECT_COLS)
    .maybeSingle();

  // Fall back to a read if the upsert didn't return the row (RLS/representation).
  if (data) return { ok: true, link: rowToLink(data as QuickbooksLinkRow) };
  const link = await getQuickbooksLink({
    realmId: input.realmId,
    localType: input.localType,
    localId: input.localId,
  });
  return link ? { ok: true, link } : { ok: false, reason: "unconfigured" };
}

/** Remove the link for one local entity (best-effort). */
export async function deleteQuickbooksLink(params: {
  realmId: string;
  localType: string;
  localId: string;
}): Promise<{ ok: boolean }> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false };

  await sb
    .from(QUICKBOOKS_LINKS_TABLE)
    .delete()
    .eq("realm_id", params.realmId)
    .eq("local_type", params.localType)
    .eq("local_id", params.localId);
  return { ok: true };
}
