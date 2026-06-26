import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FormInstance, FormInstanceField, FormShareLink } from "@shared/lib/types";
import {
  DOCUMENTS_TABLE,
  FORM_INSTANCES_TABLE,
  FORM_INSTANCE_FIELDS_TABLE,
  FORM_SHARE_LINKS_TABLE,
  JOBS_TABLE,
} from "@shared/lib/supabase";
import {
  rowToFormInstance,
  rowToFormInstanceField,
  type FormInstanceFieldRow,
  type FormInstanceRow,
} from "./formInstancesRowMap";
import { rowToFormShareLink, type FormShareLinkRow } from "./formShareLinksRowMap";
import { buildSignoffDocumentRow, type SignoffJobContext } from "./fileSignoff";
import { documentToRow } from "@features/documents/lib/documentsRowMap";
import { generateSignoffPdfServer } from "./signoffServer";
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

  // Auto-file the signoff PDF on the job when the instance is job-attached.
  // Fetch the instance row now (we need job_id). Best-effort: a PDF generation
  // failure must not fail the submit response — the answers are persisted above.
  const { data: instanceRowForFile } = await sb
    .from(FORM_INSTANCES_TABLE)
    .select("*")
    .eq("id", link.instanceId)
    .maybeSingle();

  if (instanceRowForFile && (instanceRowForFile as FormInstanceRow).job_id) {
    const instance = rowToFormInstance(instanceRowForFile as FormInstanceRow);
    const submitAudit = audit ? { ip: audit.ip ?? null, userAgent: audit.userAgent ?? null } : null;
    void fileSignoffToJob(sb, instance, Array.from(byId.values()), submitAudit).catch((e) => {
      console.error("[f/submit] fileSignoffToJob failed:", e instanceof Error ? e.message : e);
    });
  }

  return { ok: true, rejectedLocked };
}

/**
 * Generate the signoff PDF server-side and file it as a `documents` row on
 * the job. Called automatically after a public /f/<token> submit when the
 * instance has a `job_id`. Idempotent: the PDF path key is
 * `<instanceId>/signoff.pdf` — re-submitting overwrites the same bucket
 * object (upsert) and updates the existing document row in-place, so there
 * is never a pile-up of duplicate PDF rows on the job.
 */
async function fileSignoffToJob(
  sb: SupabaseClient,
  instance: FormInstance,
  fields: FormInstanceField[],
  signatureAudit: { ip: string | null; userAgent: string | null } | null
): Promise<void> {
  const jobId = instance.jobId;
  if (!jobId) return; // standalone — nothing to file

  // Fetch just enough job context (code + name) for the PDF audit block.
  const { data: jobRow } = await sb
    .from(JOBS_TABLE)
    .select("code, name")
    .eq("id", jobId)
    .maybeSingle();

  const jobCtx: SignoffJobContext = {
    jobId,
    code: (jobRow as { code: string; name: string } | null)?.code ?? jobId,
    name: (jobRow as { code: string; name: string } | null)?.name ?? "",
  };

  // Mark the instance as complete (completedBy = recipient name from the
  // link, completedAt = now) so the signoff PDF shows the right audit block.
  // The submission itself is not an owner-complete action — keep status as-is.
  const completedInstance: FormInstance = {
    ...instance,
    completedAt: instance.completedAt ?? new Date().toISOString(),
    completedBy: instance.completedBy ?? "client",
  };

  const { storagePath } = await generateSignoffPdfServer(
    completedInstance,
    fields,
    jobCtx,
    signatureAudit
  );

  // Record the signoff path on the instance (idempotent upsert via the
  // bucket's upsert:true flag in uploadSignoffPdf).
  await sb.from(FORM_INSTANCES_TABLE).update({ signoff_path: storagePath }).eq("id", instance.id);

  // File (or overwrite) the document row on the job. We upsert by
  // (project_id, storage_path) to guarantee at-most-one row per signoff —
  // re-submits supersede the prior row instead of piling up.
  const docRow = documentToRow(buildSignoffDocumentRow(completedInstance, storagePath, jobCtx));

  // Attempt to find an existing signoff document for this instance by path.
  const { data: existing } = await sb
    .from(DOCUMENTS_TABLE)
    .select("id")
    .eq("project_id", jobId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (existing) {
    // Overwrite the existing row (label + notes may have changed on reopen).
    await sb
      .from(DOCUMENTS_TABLE)
      .update({ label: docRow.label, notes: docRow.notes, uploaded_by: docRow.uploaded_by })
      .eq("id", (existing as { id: string }).id);
  } else {
    await sb.from(DOCUMENTS_TABLE).insert(docRow);
  }
}
