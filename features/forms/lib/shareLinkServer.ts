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
import { filterLockedAnswers, isShareLinkActive, type ShareAnswers } from "./shareLink";
import { computeProgress } from "./shareTracking";

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
 * Per-request audit context captured server-side on a public submit. The IP +
 * user-agent are logged quietly (the recipient never sees them); `affirmed` is
 * the "I confirm" checkbox state. All three feed the signature audit trail.
 */
export type SubmitContext = {
  ip?: string | null;
  userAgent?: string | null;
  affirmed?: boolean;
};

/**
 * Persist a public submission. Server-side it IGNORES any value aimed at a
 * locked field id (via filterLockedAnswers) — the token holder cannot edit a
 * locked field even by crafting the payload. Stamps started_at (first answer)
 * + submitted_at, recomputes the owner-visible progress %, and records the
 * signature audit trail (IP/UA/affirmation) when the form is being signed.
 */
export async function submitShareLink(
  token: string,
  answers: ShareAnswers,
  context: SubmitContext = {}
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

  // Build a working copy of the fields so we can recompute progress from the
  // merged (post-submit) state.
  const byId = new Map(fields.map((f) => [f.id, { ...f }]));

  // Persist each surviving answer. Sequential keeps it simple + ordered; the
  // payload is a handful of fields per form.
  for (const [fieldId, patch] of Object.entries(safe)) {
    const target = byId.get(fieldId);
    const update: Record<string, unknown> = {};
    if ("checked" in patch) update.checked = patch.checked ?? null;
    if ("value" in patch) update.value = patch.value ?? null;
    if ("note" in patch) update.note = patch.note ?? null;
    if (Object.keys(update).length === 0) continue;
    // Mirror onto the working copy for the progress recompute.
    if (target) {
      if ("checked" in update) target.checked = update.checked as boolean | null;
      if ("value" in update) target.value = update.value;
      if ("note" in update) target.note = update.note as string | null;
    }
    const { error: upErr } = await sb
      .from(FORM_INSTANCE_FIELDS_TABLE)
      .update(update)
      .eq("id", fieldId)
      .eq("instance_id", link.instanceId); // belt-and-suspenders scope
    if (upErr) throw upErr;
  }

  const now = new Date().toISOString();

  // Does this form even carry a signature field? The "I confirm" affirmation is
  // only meaningful (and only shown to the client) when something is being signed.
  const signatureFields = fields.filter((f) => f.type === "signature");
  const hasSignature = signatureFields.length > 0;

  // When the signer affirms, stamp the affirmation into each signature field's
  // config so it travels onto the signoff PDF (which renders from the fields).
  // Server-authoritative: the client cannot fabricate this — it is set here only
  // when the request carried affirmed === true.
  if (hasSignature && context.affirmed === true) {
    for (const sig of signatureFields) {
      const cfg = (sig.config ?? {}) as Record<string, unknown>;
      const nextConfig = {
        ...cfg,
        affirmed: true,
        signedAt: typeof cfg.signedAt === "string" ? cfg.signedAt : now,
      };
      const { error: cfgErr } = await sb
        .from(FORM_INSTANCE_FIELDS_TABLE)
        .update({ config: nextConfig })
        .eq("id", sig.id)
        .eq("instance_id", link.instanceId);
      if (cfgErr) throw cfgErr;
    }
  }

  const stamp: Record<string, unknown> = {
    submitted_at: now,
    progress: computeProgress(Array.from(byId.values())),
  };
  if (link.viewedAt === null) stamp.viewed_at = now;
  // A submit implies the recipient started; backfill started_at if not yet set.
  if (link.startedAt === null) stamp.started_at = now;
  // Signature audit trail: when the form is being signed, capture the "I confirm"
  // affirmation + the IP/UA server-side (the recipient never sees these). Only
  // stamped on a signing submit, so a plain answer-update never clobbers a prior
  // signing's audit record.
  if (hasSignature && context.affirmed !== undefined) {
    stamp.signature_affirmed = context.affirmed === true;
    stamp.signed_ip = context.ip ?? null;
    stamp.signed_user_agent = context.userAgent ?? null;
  }
  await sb.from(FORM_SHARE_LINKS_TABLE).update(stamp).eq("id", link.id);

  return { ok: true, rejectedLocked };
}
