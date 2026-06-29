import "server-only";
import { DOCUMENTS_TABLE, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { loadCapabilityRow } from "@shared/lib/capabilityLink";
import { rowToShareToken, type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import { JOB_DOCUMENTS_BUCKET } from "@features/drawings/lib/storage";
import { isClientSafeDocument } from "./documentShare";
import { rowToDocument, type DocumentRow } from "./documentsRowMap";
import type { ProjectDocument } from "@shared/lib/types";
import {
  buildWatermarkText,
  classifyWatermarkTarget,
  watermarkImagePdf,
  watermarkPdf,
} from "./documentWatermark";

/**
 * Server-only render path for the no-login document VIEW portal's "Open" button
 * (S4, issue #215). The recipient name + date is watermarked into the RENDERED
 * bytes on every request; the stored object is never mutated (we download it,
 * overlay in memory, and stream the result). Uses the SERVICE ROLE key, but every
 * read is scoped to the ONE token — and, critically, the requested document is
 * re-authorised against the token's job + the SAME client-safe exposure rules the
 * view portal enforces, so a recipient can't fetch an internal doc by guessing its
 * id. Imported only by the server route under src/app/api/documents/portal.
 */

const DOC_COLUMNS =
  "id, project_id, kind, label, drive_url, version, is_current, notes, uploaded_by, created_at, source, storage_path, mime, page_count";

export type PortalFileResult =
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: string;
      /** Watermarked file name shown to the recipient on download. */
      filename: string;
      /** Whether a watermark was actually applied (false for passthrough types). */
      watermarked: boolean;
    }
  | { ok: false; status: 404 | 410 | 500 };

/**
 * Pure authorisation decision: a requested document may be served through a
 * `document_view` token ONLY when it is in the SAME job the token anchors AND it
 * passes the same client-safe exposure rules as the portal list (current,
 * uploaded — not a Drive link — and a client-safe kind). Anchor / requested null
 * → denied. Kept pure so the security rule is unit-tested without a DB.
 */
export function isPortalFileAuthorized(
  anchor: ProjectDocument | null,
  requested: ProjectDocument | null
): boolean {
  if (!anchor || !requested) return false;
  if (requested.projectId !== anchor.projectId) return false;
  return isClientSafeDocument(requested);
}

/**
 * Load + watermark one document behind a `document_view` token. Reasons map to
 * HTTP: unknown token / unauthorised doc / missing object → 404; revoked or
 * expired → 410; unconfigured service client → 500.
 */
export async function loadPortalDocumentFile(
  token: string,
  docId: string
): Promise<PortalFileResult> {
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, status: 500 };

  // stampView:false — opening a single file is not the "first view" signal; the
  // /d page load already stamped viewed_at + bumped the receipt.
  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, token, {
    capabilityType: "document_view",
    stampView: false,
  });
  if (!res.ok) {
    return { ok: false, status: res.reason === "not_found" ? 404 : 410 };
  }

  const share = rowToShareToken(res.row);
  if (!share.documentId) return { ok: false, status: 404 };

  // The anchor pins the job; the requested doc is re-authorised against it.
  const anchor = await loadDoc(sb, share.documentId);
  const requested = docId === share.documentId ? anchor : await loadDoc(sb, docId);
  if (!isPortalFileAuthorized(anchor, requested) || !requested?.storagePath) {
    return { ok: false, status: 404 };
  }

  const { data: blob, error } = await sb.storage
    .from(JOB_DOCUMENTS_BUCKET)
    .download(requested.storagePath);
  if (error || !blob) return { ok: false, status: 404 };
  const original = new Uint8Array(await blob.arrayBuffer());

  const stamp = buildWatermarkText(share.recipientName, new Date());
  const target = classifyWatermarkTarget(requested.mime, requested.storagePath);

  if (target === "pdf") {
    return {
      ok: true,
      bytes: await watermarkPdf(original, stamp),
      contentType: "application/pdf",
      filename: downloadName(requested, ".pdf"),
      watermarked: true,
    };
  }
  if (target === "image") {
    return {
      ok: true,
      bytes: await watermarkImagePdf(original, requested.mime ?? "image/png", stamp),
      contentType: "application/pdf",
      filename: downloadName(requested, ".pdf"),
      watermarked: true,
    };
  }
  // Passthrough: a kind we can't render-stamp (rare on a client-safe set). Stream
  // the original, still scoped to the token, but flag it as not watermarked.
  return {
    ok: true,
    bytes: original,
    contentType: requested.mime ?? "application/octet-stream",
    filename: downloadName(requested, ""),
    watermarked: false,
  };
}

async function loadDoc(
  sb: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  id: string
): Promise<ProjectDocument | null> {
  const { data, error } = await sb
    .from(DOCUMENTS_TABLE)
    .select(DOC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToDocument(data as DocumentRow);
}

/** A friendly, watermark-aware download name derived from the document label. */
function downloadName(doc: ProjectDocument, ext: string): string {
  const base = (doc.label || "document").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  const suffix = ext ? `-watermarked${ext}` : "";
  return `${base || "document"}${suffix}`;
}
