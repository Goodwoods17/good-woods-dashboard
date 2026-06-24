/**
 * Upload + signed-URL helpers for the private `job-documents` bucket.
 * Browser-only. Uploads REQUIRE Supabase (no data-URL fallback — PDFs/large
 * images would exceed localStorage quota). See ADR 0016.
 */
import { getSupabase, hasSupabase } from "@shared/lib/supabase";

export const JOB_DOCUMENTS_BUCKET = "job-documents";

/** Signed-URL lifetime (1 hour) — long enough for a markup session. */
// TODO(slice-3): markup sessions can outlive this; refresh the signed URL on
// expiry once annotation lands. Viewing-only (Slice 0) is unaffected.
const SIGNED_URL_TTL = 60 * 60;

function fileExt(file: { name: string; type: string }): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const ext = (fromName || file.type.split("/")[1] || "bin").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

/** Deterministic object path: `<projectId>/<docId>.<ext>`. */
export function documentStoragePath(
  projectId: string,
  docId: string,
  file: { name: string; type: string }
): string {
  return `${projectId}/${docId}.${fileExt(file)}`;
}

/** Upload a drawing file. Throws if Supabase is not configured. */
export async function uploadDrawing(
  projectId: string,
  docId: string,
  file: File
): Promise<{ storagePath: string }> {
  if (!hasSupabase()) {
    throw new Error("File uploads require Supabase. Configure it, or paste a link instead.");
  }
  const sb = getSupabase();
  const path = documentStoragePath(projectId, docId, file);
  const { error } = await sb.storage.from(JOB_DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path };
}

/** Resolve a stored path to a fresh signed URL. */
export async function resolveDocumentUrl(storagePath: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(JOB_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/** Best-effort removal of a stored file. */
export async function removeDrawing(storagePath: string): Promise<void> {
  if (!hasSupabase()) return;
  const sb = getSupabase();
  await sb.storage.from(JOB_DOCUMENTS_BUCKET).remove([storagePath]);
}
