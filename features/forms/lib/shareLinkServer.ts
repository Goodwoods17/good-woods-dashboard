import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FormInstance, FormInstanceField, FormShareLink } from "@shared/lib/types";
import {
  FORM_INSTANCES_TABLE,
  FORM_INSTANCE_FIELDS_TABLE,
  FORM_SHARE_LINKS_TABLE,
} from "@shared/lib/supabase";
import {
  rowToFormInstance,
  rowToFormInstanceField,
  type FormInstanceFieldRow,
  type FormInstanceRow,
} from "./formInstancesRowMap";
import { rowToFormShareLink, type FormShareLinkRow } from "./formShareLinksRowMap";
import {
  computeProgress,
  filterLockedAnswers,
  isShareLinkActive,
  type ShareAnswers,
} from "./shareLink";

/**
 * Server-only data access for the no-login /f/<token> portal. Uses the SERVICE
 * ROLE key, but every read/write is scoped to the ONE instance behind the token
 * — the token is the capability. The public client (anon) is never used here;
 * anon RLS denies form_share_links entirely. This module reads
 * SUPABASE_SERVICE_ROLE_KEY (a server-only env var, never NEXT_PUBLIC_*), so it
 * is only ever imported by server components / route handlers under src/app/f.
 */

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches global fetch with its Data Cache; GET requests default to
      // `force-cache`. supabase-js issues its reads through fetch, so without this
      // the first load of a token (e.g. before the client submits) gets cached and
      // a later resume read serves the STALE answer — the saved checkbox comes back
      // unchecked. These reads are inherently live (form state behind a token), so
      // opt every request out of the cache.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return serviceClient;
}

export type ShareLinkBundle = {
  link: FormShareLink;
  instance: FormInstance;
  fields: FormInstanceField[];
};

/** The reason a token cannot be opened, for a clean public-facing state. */
export type ShareLinkLoadResult =
  | { ok: true; bundle: ShareLinkBundle }
  | { ok: false; reason: "not_found" | "revoked" | "unconfigured" };

/**
 * Load the one form instance behind a token. Rejects a revoked link with a
 * distinct reason so the page can show "link no longer active" (never data).
 * Side effect: stamps viewed_at on first open (resume-friendly; idempotent-ish).
 */
export async function loadShareLink(token: string): Promise<ShareLinkLoadResult> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const { data: linkRow, error: linkErr } = await sb
    .from(FORM_SHARE_LINKS_TABLE)
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!linkRow) return { ok: false, reason: "not_found" };

  const link = rowToFormShareLink(linkRow as FormShareLinkRow);
  if (!isShareLinkActive(link)) return { ok: false, reason: "revoked" };

  const { data: instRow, error: instErr } = await sb
    .from(FORM_INSTANCES_TABLE)
    .select("*")
    .eq("id", link.instanceId)
    .maybeSingle();
  if (instErr) throw instErr;
  if (!instRow) return { ok: false, reason: "not_found" };

  const { data: fieldRows, error: fieldErr } = await sb
    .from(FORM_INSTANCE_FIELDS_TABLE)
    .select("*")
    .eq("instance_id", link.instanceId)
    .order("sort_order", { ascending: true });
  if (fieldErr) throw fieldErr;

  // First view stamps viewed_at (best-effort; don't fail the load on a write error).
  if (link.viewedAt === null) {
    await sb
      .from(FORM_SHARE_LINKS_TABLE)
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", link.id);
  }

  return {
    ok: true,
    bundle: {
      link,
      instance: rowToFormInstance(instRow as FormInstanceRow),
      fields: (fieldRows as FormInstanceFieldRow[] | null)?.map(rowToFormInstanceField) ?? [],
    },
  };
}

export type SubmitResult =
  | { ok: true; rejectedLocked: string[] }
  | { ok: false; reason: "not_found" | "revoked" | "unconfigured" };

/**
 * The signature audit context, captured server-side from the request (never
 * client-supplied). Quietly logged so a client signature is dispute-resistant.
 */
export type SubmitAudit = {
  ip: string | null;
  userAgent: string | null;
};

/**
 * Persist a public submission. Server-side it IGNORES any value aimed at a
 * locked field id (via filterLockedAnswers) — the token holder cannot edit a
 * locked field even by crafting the payload. Stamps started_at (first save),
 * submitted_at, viewed_at, and the owner-visible progress %, and quietly logs
 * the recipient's IP + user-agent (the signature audit trail).
 */
export async function submitShareLink(
  token: string,
  answers: ShareAnswers,
  audit?: SubmitAudit
): Promise<SubmitResult> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const { data: linkRow, error: linkErr } = await sb
    .from(FORM_SHARE_LINKS_TABLE)
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!linkRow) return { ok: false, reason: "not_found" };

  const link = rowToFormShareLink(linkRow as FormShareLinkRow);
  if (!isShareLinkActive(link)) return { ok: false, reason: "revoked" };

  const { data: fieldRows, error: fieldErr } = await sb
    .from(FORM_INSTANCE_FIELDS_TABLE)
    .select("*")
    .eq("instance_id", link.instanceId);
  if (fieldErr) throw fieldErr;
  const fields = (fieldRows as FormInstanceFieldRow[] | null)?.map(rowToFormInstanceField) ?? [];

  // THE security gate: drop locked + unknown field ids before any write.
  const safe = filterLockedAnswers(answers, link, fields);
  const rejectedLocked = Object.keys(answers).filter(
    (id) => !(id in safe) && link.lockedFieldIds.includes(id)
  );

  // Persist each surviving answer. Sequential keeps it simple + ordered; the
  // payload is a handful of fields per form. Mirror each write into the
  // in-memory field so the progress % reflects this submission without a re-read.
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const [fieldId, patch] of Object.entries(safe)) {
    const update: Record<string, unknown> = {};
    if ("checked" in patch) update.checked = patch.checked ?? null;
    if ("value" in patch) update.value = patch.value ?? null;
    if ("note" in patch) update.note = patch.note ?? null;
    if (Object.keys(update).length === 0) continue;
    const { error: upErr } = await sb
      .from(FORM_INSTANCE_FIELDS_TABLE)
      .update(update)
      .eq("id", fieldId)
      .eq("instance_id", link.instanceId); // belt-and-suspenders scope
    if (upErr) throw upErr;
    const existing = byId.get(fieldId);
    if (existing) byId.set(fieldId, { ...existing, ...update } as typeof existing);
  }

  const now = new Date().toISOString();
  const stamp: Record<string, unknown> = {
    submitted_at: now,
    progress: computeProgress(Array.from(byId.values())),
  };
  if (link.viewedAt === null) stamp.viewed_at = now;
  // First save flips the link into "Started" (kept once set — never overwritten).
  if (link.startedAt === null) stamp.started_at = now;
  // Quietly log the audit pair (IP + UA) — only ever set, never cleared.
  if (audit?.ip) stamp.submit_ip = audit.ip;
  if (audit?.userAgent) stamp.submit_user_agent = audit.userAgent;
  await sb.from(FORM_SHARE_LINKS_TABLE).update(stamp).eq("id", link.id);

  return { ok: true, rejectedLocked };
}
