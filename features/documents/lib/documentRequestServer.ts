import "server-only";
import { DOCUMENTS_TABLE, SHARE_TOKENS_TABLE, JOBS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { loadCapabilityRow } from "@shared/lib/capabilityLink";
import { rowToShareToken, type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import { JOB_DOCUMENTS_BUCKET } from "@features/drawings/lib/storage";
import type { CapabilityType, DocumentRequestSubmission } from "@shared/lib/types";
import { sniffMime, isAllowedUploadMime, uploadExtensionFor } from "./uploadMimeSniff";
import { checkUploadAllowed, type UploadUsage } from "./uploadQuota";
import { buildRequestChecklist, type RequestChecklist } from "./documentRequestChecklist";

/**
 * Server-only data + WRITE path for the no-login /d/<token> designer UPLOAD
 * portal (S11, ADR 0022 · milestone #12) — the FIRST writing capability link.
 * Security-critical: a no-login token that WRITES is the highest-risk surface in
 * the app, so every gate here is server-side and the route is the authority
 * (the bucket limits in 20260719000000 are only defence-in-depth):
 *
 *   • SERVICE ROLE only — the public anon client is never used; null → caller
 *     returns 503 (the share_tokens *_anon_none policy denies anon entirely).
 *   • capability_type=document_request — a foreign-type token reads as not_found.
 *   • Re-check `revoked_at`/expiry IMMEDIATELY BEFORE the storage write (the
 *     irreversible side effect) — not just at load — so a revoke that lands
 *     mid-request still blocks the object from being created.
 *   • Magic-byte MIME sniff on the RECEIVED bytes (never the client `file.type`);
 *     restricted to a narrow allow-list.
 *   • Per-file size limit + per-token upload COUNT and TOTAL-byte quota, all on
 *     the received bytes.
 *   • Path control: projectId comes from the TOKEN ROW only, the docId is
 *     server-generated, the client filename never touches the path, upsert:false.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY (server-only), so this module is only ever
 * imported by the server route under src/app/d / src/app/api/documents/portal.
 */

const DOCUMENT_REQUEST: CapabilityType = "document_request";

// ─── Read: the portal bundle (checklist + status + prior submissions) ────────

export type DocumentRequestBundle = {
  jobName: string;
  recipientName: string | null;
  requestedFiles: string[];
  checklist: RequestChecklist;
  submissions: DocumentRequestSubmission[];
  contact: { name: string; phone: string | null; email: string | null } | null;
};

export type DocumentRequestLoadResult =
  | { ok: true; bundle: DocumentRequestBundle }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "unconfigured" };

/** Resolve a token's capability_type (so /d/<token> can dispatch view vs upload). */
export async function resolveCapabilityType(token: string): Promise<CapabilityType | null> {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const { data } = await sb
    .from(SHARE_TOKENS_TABLE)
    .select("capability_type")
    .eq("token", token)
    .maybeSingle();
  const t = (data as { capability_type?: string } | null)?.capability_type;
  return (t as CapabilityType) ?? null;
}

/** Load the upload portal's bundle behind a document_request token. */
export async function loadDocumentRequestPortal(token: string): Promise<DocumentRequestLoadResult> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, token, {
    capabilityType: DOCUMENT_REQUEST,
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const share = rowToShareToken(res.row);
  if (!share.jobId) return { ok: false, reason: "not_found" };

  const requestedFiles = Array.isArray(share.state.requestedFiles)
    ? share.state.requestedFiles.filter((s): s is string => typeof s === "string")
    : [];
  const submissions = Array.isArray(share.state.submissions) ? share.state.submissions : [];
  const checklist = buildRequestChecklist(
    requestedFiles,
    submissions.map((s) => ({ requestIndex: s.requestIndex }))
  );

  const { jobName, contact } = await loadJobContact(sb, share.jobId);
  return {
    ok: true,
    bundle: {
      jobName,
      recipientName: share.recipientName,
      requestedFiles,
      checklist,
      submissions,
      contact,
    },
  };
}

// ─── Write: accept one uploaded file ─────────────────────────────────────────

export type DesignerUploadParams = {
  token: string;
  bytes: Uint8Array;
  clientFilename: string;
  requestIndex: number | null;
  ip?: string | null;
  ua?: string | null;
};

export type DesignerUploadResult =
  | {
      ok: true;
      submissionId: string;
      documentId: string;
      filename: string;
      checklist: RequestChecklist;
    }
  | { ok: false; status: number; reason: string; message: string };

/** Map a capability-load failure to an HTTP status for the route. */
function loadFailStatus(reason: "not_found" | "revoked" | "expired"): {
  status: number;
  message: string;
} {
  if (reason === "revoked") return { status: 410, message: "This upload link has been revoked." };
  if (reason === "expired") return { status: 410, message: "This upload link has expired." };
  return { status: 404, message: "This upload link is not valid." };
}

/**
 * Accept one uploaded file on a document_request link. Returns a typed result
 * (never throws to the route) carrying the HTTP status to use. See the module
 * header for the full security posture; the ORDER below is deliberate:
 * configured → load+type+revoked → size → magic-byte → RE-CHECK revoked →
 * server-pathed write (upsert:false) → documents row → append submission.
 */
export async function handleDesignerUpload(
  params: DesignerUploadParams
): Promise<DesignerUploadResult> {
  const sb = getServiceRoleClient();
  if (!sb) {
    return { ok: false, status: 503, reason: "unconfigured", message: "Uploads are unavailable." };
  }

  // Load + assert type + first revoked/expiry check (stampView:false — an upload
  // POST is not a "view").
  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, params.token, {
    capabilityType: DOCUMENT_REQUEST,
    stampView: false,
  });
  if (!res.ok) {
    const f = loadFailStatus(res.reason);
    return { ok: false, status: f.status, reason: res.reason, message: f.message };
  }

  const share = rowToShareToken(res.row);
  if (!share.jobId) {
    return {
      ok: false,
      status: 404,
      reason: "not_found",
      message: "This upload link is not valid.",
    };
  }

  const requestedFiles = Array.isArray(share.state.requestedFiles)
    ? share.state.requestedFiles.filter((s): s is string => typeof s === "string")
    : [];
  const priorSubmissions = Array.isArray(share.state.submissions) ? share.state.submissions : [];

  // Per-file size + per-token count/byte quota — on the RECEIVED bytes.
  const usage: UploadUsage = {
    count: priorSubmissions.length,
    totalBytes: priorSubmissions.reduce((sum, s) => sum + (Number(s.bytes) || 0), 0),
  };
  const size = params.bytes.byteLength;
  const quota = checkUploadAllowed(size, usage);
  if (!quota.ok) {
    return { ok: false, status: quota.status, reason: quota.reason, message: quota.message };
  }

  // Magic-byte MIME sniff — the client `file.type` is irrelevant.
  const sniffed = sniffMime(params.bytes);
  if (!isAllowedUploadMime(sniffed)) {
    return {
      ok: false,
      status: 415,
      reason: "bad_type",
      message: "Unsupported file type. Upload a PDF, PNG, JPEG, or WEBP.",
    };
  }

  // RE-CHECK revoked/expiry IMMEDIATELY before the irreversible storage write.
  // A revoke that landed since the load above must still block the object.
  const { data: freshRow } = await sb
    .from(SHARE_TOKENS_TABLE)
    .select("revoked_at, expires_at")
    .eq("token", params.token)
    .eq("capability_type", DOCUMENT_REQUEST)
    .maybeSingle();
  const fresh = freshRow as { revoked_at: string | null; expires_at: string | null } | null;
  if (!fresh) {
    return {
      ok: false,
      status: 404,
      reason: "not_found",
      message: "This upload link is not valid.",
    };
  }
  if (fresh.revoked_at !== null) {
    return {
      ok: false,
      status: 410,
      reason: "revoked",
      message: "This upload link has been revoked.",
    };
  }
  if (fresh.expires_at != null && new Date(fresh.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 410, reason: "expired", message: "This upload link has expired." };
  }

  // Path control: jobId from the TOKEN ROW, server-generated docId, never the
  // client filename. upsert:false so a (statistically impossible) collision errors
  // rather than overwriting.
  const documentId = crypto.randomUUID();
  const ext = uploadExtensionFor(sniffed);
  const storagePath = `${share.jobId}/${documentId}.${ext}`;
  const displayName = sanitiseFilename(params.clientFilename, ext);

  const { error: upErr } = await sb.storage
    .from(JOB_DOCUMENTS_BUCKET)
    .upload(storagePath, Buffer.from(params.bytes), { contentType: sniffed, upsert: false });
  if (upErr) {
    return {
      ok: false,
      status: 502,
      reason: "storage_error",
      message: "Upload failed. Try again.",
    };
  }

  // The live documents row — appears in the job immediately (uploaded_by = the
  // token recipient). kind=designer (the requested artefacts ARE designer files).
  const { error: docErr } = await sb.from(DOCUMENTS_TABLE).insert({
    id: documentId,
    project_id: share.jobId,
    kind: "designer",
    label: displayName,
    drive_url: null,
    version: null,
    is_current: true,
    notes: "Uploaded via the designer request portal.",
    uploaded_by: share.recipientName ?? "Designer (upload link)",
    source: "upload",
    storage_path: storagePath,
    mime: sniffed,
    page_count: null,
  });
  if (docErr) {
    // Best-effort: don't leave an orphaned object if the row insert failed.
    await sb.storage.from(JOB_DOCUMENTS_BUCKET).remove([storagePath]);
    return { ok: false, status: 500, reason: "row_error", message: "Upload failed. Try again." };
  }

  // Clamp the client requestIndex to a real requested row (else: unfiled extra).
  const requestIndex =
    typeof params.requestIndex === "number" &&
    params.requestIndex >= 0 &&
    params.requestIndex < requestedFiles.length
      ? params.requestIndex
      : null;

  const submission: DocumentRequestSubmission = {
    id: crypto.randomUUID(),
    documentId,
    filename: displayName,
    mime: sniffed,
    bytes: size,
    requestIndex,
    createdAt: new Date().toISOString(),
  };
  const submissions = [...priorSubmissions, submission];

  // Append the submission to the token's state (and stamp the audit ip/ua, which
  // are server-set, never client-supplied). Best-effort: the file is already
  // stored + the row exists, so a state-write hiccup must not 500 the upload.
  await sb
    .from(SHARE_TOKENS_TABLE)
    .update({
      state: { ...share.state, submissions },
      ip: params.ip ?? share.ip ?? null,
      ua: params.ua ?? share.ua ?? null,
    })
    .eq("token", params.token)
    .eq("capability_type", DOCUMENT_REQUEST);

  // Best-effort staff alert — never blocks or fails the upload.
  void notifyStaffOfUpload({ jobId: share.jobId, recipientName: share.recipientName, displayName });

  const checklist = buildRequestChecklist(
    requestedFiles,
    submissions.map((s) => ({ requestIndex: s.requestIndex }))
  );

  return { ok: true, submissionId: submission.id, documentId, filename: displayName, checklist };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Display-only label from the client filename. Strips any path component (a
 * traversal attempt can't reach the storage path anyway — it is server-built —
 * but the label must never carry `../`), collapses to a basename, caps the
 * length, and guarantees the server-chosen extension.
 */
function sanitiseFilename(name: string, ext: string): string {
  const base = (name || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[ -]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .trim()
    .slice(0, 120);
  const stem = base.replace(/\.[^.]*$/, "").trim() || "Designer upload";
  return `${stem}.${ext}`;
}

async function loadJobContact(
  sb: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  jobId: string
): Promise<{ jobName: string; contact: DocumentRequestBundle["contact"] }> {
  const { data: jobRow } = await sb
    .from(JOBS_TABLE)
    .select("name, payer_id")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobRow as { name: string | null; payer_id: string | null } | null;
  const jobName = job?.name ?? "Your project";
  if (!job?.payer_id) return { jobName, contact: null };

  const { data: contactRow } = await sb
    .from("contacts")
    .select("name, emails, phones")
    .eq("id", job.payer_id)
    .maybeSingle();
  const c = contactRow as { name: string | null; emails: unknown; phones: unknown } | null;
  if (!c?.name) return { jobName, contact: null };
  return {
    jobName,
    contact: { name: c.name, phone: firstString(c.phones), email: firstString(c.emails) },
  };
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const v of value) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string") {
      const s = (v as { value: string }).value.trim();
      if (s) return s;
    }
  }
  return null;
}

/**
 * Best-effort staff alert when a designer drops a file. Uses Resend when
 * configured (RESEND_API_KEY / RESEND_FROM / GOOD_WOODS_STAFF_EMAIL, server-only);
 * a no-op when any is absent (CI / preview). Never throws.
 */
async function notifyStaffOfUpload(args: {
  jobId: string;
  recipientName: string | null;
  displayName: string;
}): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const to = process.env.GOOD_WOODS_STAFF_EMAIL;
    if (!apiKey || !from || !to) return;
    const who = args.recipientName ?? "A designer";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to,
      subject: `New designer upload — ${args.displayName}`,
      text: `${who} uploaded "${args.displayName}" to job ${args.jobId} via the request portal.`,
      html: `<p>${who} uploaded <strong>${args.displayName}</strong> to job ${args.jobId} via the request portal.</p>`,
    });
  } catch {
    /* staff alert is best-effort — never fails the upload */
  }
}
