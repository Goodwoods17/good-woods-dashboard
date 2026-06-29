import "server-only";
import { DOCUMENTS_TABLE, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { loadCapabilityRow } from "@shared/lib/capabilityLink";
import { rowToShareToken, type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import { rowToDocument, type DocumentRow } from "./documentsRowMap";
import { computeSuperseded, selectClientSafeDocuments, type SupersededInfo } from "./documentShare";
import { buildPortalFileUrl } from "./documentWatermark";
import { CLIENT_SAFE_KINDS, type ProjectDocument } from "@shared/lib/types";

// CLIENT_SAFE_KINDS is a typed DocumentKind[]; PostgREST's `.in()` wants string[].
const CLIENT_SAFE_KIND_VALUES: string[] = CLIENT_SAFE_KINDS;

/**
 * Server-only data access for the no-login /d/<token> document VIEW portal (S2,
 * ADR 0022 · milestone #12). Uses the SERVICE ROLE key, but every read is scoped
 * to the ONE job behind the token — the token is the capability. The public anon
 * client is never used here; the share_tokens *_anon_none policy denies anon
 * entirely. Reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_*),
 * so this module is only ever imported by the server route under src/app/d.
 *
 * Security posture (locked-decision-3): the curated set is built from an
 * EXPLICIT column select with a server-side allow-list — `.in("kind",
 * CLIENT_SAFE_KINDS)` (excludes `other` + `toolpath_cnc`), `.neq("source",
 * "link")` (Drive links can't guarantee no-login access), `.eq("is_current",
 * true)` — never `select("*")`. Uploaded files are opened through the per-doc
 * watermark route (S4) — the bytes are never exposed beyond the token capability,
 * and the recipient name + date is stamped in at render time.
 */

/** The explicit, audited column list — NEVER `*` on a public path. */
const DOC_COLUMNS =
  "id, project_id, kind, label, drive_url, version, is_current, notes, uploaded_by, created_at, source, storage_path, mime, page_count";

/** One document as it appears on the portal, with its watermark-route open URL. */
export type PortalDocument = {
  doc: ProjectDocument;
  /**
   * The token-scoped watermark route the "Open" button points at (S4) — opening
   * it streams the recipient-watermarked bytes. Null when there is no stored
   * object to render.
   */
  url: string | null;
};

export type DocumentPortalBundle = {
  jobName: string;
  recipientName: string | null;
  documents: PortalDocument[];
  superseded: SupersededInfo;
  /** Who-to-call contact card — derived from the job, never client-supplied. */
  contact: { name: string; phone: string | null; email: string | null } | null;
};

export type DocumentPortalLoadResult =
  | { ok: true; bundle: DocumentPortalBundle }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "unconfigured" };

/**
 * Load the curated, client-safe document set behind a token. Rejects a revoked /
 * expired / unknown link with a distinct reason so the page shows a clean
 * inactive state, never data. Side effects (best-effort, never fail the load):
 * stamps `viewed_at` on first open and bumps `view_count` (the read receipt).
 */
export async function loadDocumentPortal(token: string): Promise<DocumentPortalLoadResult> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  // Select-by-token (scoped to capability_type=document_view so a foreign-type
  // token reads as not_found) → revoked / expiry checks → first-view stamp.
  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, token, {
    capabilityType: "document_view",
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const share = rowToShareToken(res.row);
  if (!share.documentId) return { ok: false, reason: "not_found" };

  // The anchored document gives us the job; the curated set is derived from it.
  const { data: anchorRow, error: anchorErr } = await sb
    .from(DOCUMENTS_TABLE)
    .select(DOC_COLUMNS)
    .eq("id", share.documentId)
    .maybeSingle();
  if (anchorErr) throw anchorErr;
  if (!anchorRow) return { ok: false, reason: "not_found" };
  const anchor = rowToDocument(anchorRow as DocumentRow);

  // The curated set: the job's CURRENT, CLIENT-SAFE, UPLOADED docs. The allow-list
  // is applied in Postgres (defence-in-depth) AND re-asserted in TS below.
  const { data: setRows, error: setErr } = await sb
    .from(DOCUMENTS_TABLE)
    .select(DOC_COLUMNS)
    .eq("project_id", anchor.projectId)
    .eq("is_current", true)
    .neq("source", "link")
    .in("kind", CLIENT_SAFE_KIND_VALUES)
    .order("created_at", { ascending: false });
  if (setErr) throw setErr;

  const safe = selectClientSafeDocuments(
    (setRows as DocumentRow[] | null)?.map(rowToDocument) ?? []
  );

  // Each doc opens through the per-doc watermark route (S4) — no pre-signing here,
  // so the portal's first paint isn't blocked by signing OR stamping; the render
  // happens on click, inside the token capability.
  const documents: PortalDocument[] = safe.map((doc) => ({
    doc,
    url: doc.storagePath ? buildPortalFileUrl(token, doc.id) : null,
  }));

  // Superseded banner: compare the anchored doc against the live current set
  // (which we already loaded for the same kind, plus the anchor's own kind).
  const superseded = computeSuperseded(anchor, safe);

  // Who-to-call + job name. Service-role read of just the display fields.
  const { jobName, contact } = await loadJobContact(sb, anchor.projectId);

  // Read receipt: bump view_count (best-effort; never fails the load).
  await sb
    .from(SHARE_TOKENS_TABLE)
    .update({ view_count: share.viewCount + 1 })
    .eq("token", token)
    .eq("capability_type", "document_view");

  return {
    ok: true,
    bundle: { jobName, recipientName: share.recipientName, documents, superseded, contact },
  };
}

/**
 * Record the furthest page a viewer reached (coarse engagement analytics). Stored
 * in `state.furthestPage`, monotonic (never decreases), clamped to a sane range.
 * Best-effort and public — it is analytics only, never trusted for access.
 */
export async function recordFurthestPage(token: string, page: number): Promise<boolean> {
  const sb = getServiceRoleClient();
  if (!sb) return false;
  if (!Number.isFinite(page)) return false;
  const next = Math.min(Math.max(Math.floor(page), 0), 100_000);

  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, token, {
    capabilityType: "document_view",
    stampView: false,
  });
  if (!res.ok) return false;

  const share = rowToShareToken(res.row);
  const current = typeof share.state.furthestPage === "number" ? share.state.furthestPage : 0;
  if (next <= current) return true; // already at/ahead — nothing to write

  const { error } = await sb
    .from(SHARE_TOKENS_TABLE)
    .update({ state: { ...share.state, furthestPage: next } })
    .eq("token", token)
    .eq("capability_type", "document_view");
  return !error;
}

async function loadJobContact(
  sb: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  jobId: string
): Promise<{ jobName: string; contact: DocumentPortalBundle["contact"] }> {
  const { data: jobRow } = await sb
    .from("jobs")
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

/** First non-empty string in a jsonb array column (contacts.emails / .phones). */
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
