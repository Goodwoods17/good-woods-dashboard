/**
 * Photo + signature upload helpers for the private `form-photos` bucket
 * (stood up in the slice-1 migration). Clones the reface-photos helper pattern
 * per the feature spec ("Storage helpers shared with reface → cloned per-feature
 * in slice 3").
 *
 * Browser-only (uses File / FileReader / fetch on data URLs). When Supabase is
 * not configured, both photos and signature PNGs fall back to inline `data:`
 * URLs so the localStorage backend stays fully functional offline — matching the
 * reface photo helper.
 */
import { getSupabase, hasSupabase } from "@shared/lib/supabase";

export const FORM_PHOTOS_BUCKET = "form-photos";

/** Signed-URL lifetime (1 hour) — long enough for a fill session. */
const SIGNED_URL_TTL = 60 * 60;

/** Normalize a file extension from a name or mime subtype (pure, testable). */
export function formFileExt(file: { name: string; type: string }): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const ext = (fromName || file.type.split("/")[1] || "jpg").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

/** Deterministic object path: `<instanceId>/<fieldId>.<ext>` (pure, testable). */
export function formPhotoPath(
  instanceId: string,
  fieldId: string,
  file: { name: string; type: string }
): string {
  return `${instanceId}/${fieldId}.${formFileExt(file)}`;
}

/** Read a File as a base64 data URL (localStorage fallback path). */
function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a photo for a form-instance field. With Supabase, stores under
 * `<instanceId>/<fieldId>.<ext>` and returns that path; without it, returns a
 * `data:` URL so the offline backend can render it directly.
 */
export async function uploadFormPhoto(
  instanceId: string,
  fieldId: string,
  file: File
): Promise<{ storagePath: string }> {
  if (!hasSupabase()) {
    return { storagePath: await readDataUrl(file) };
  }
  const sb = getSupabase();
  const path = formPhotoPath(instanceId, fieldId, file);
  const { error } = await sb.storage.from(FORM_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path };
}

/**
 * Upload a signature PNG (captured from a canvas as a `data:` URL). With
 * Supabase, decodes the data URL to a Blob and stores it as a PNG under
 * `<instanceId>/<fieldId>.png`; without it, returns the data URL unchanged.
 */
export async function uploadSignaturePng(
  instanceId: string,
  fieldId: string,
  dataUrl: string
): Promise<{ storagePath: string }> {
  if (!hasSupabase()) {
    return { storagePath: dataUrl };
  }
  const blob = await (await fetch(dataUrl)).blob();
  const sb = getSupabase();
  const path = `${instanceId}/${fieldId}.png`;
  const { error } = await sb.storage.from(FORM_PHOTOS_BUCKET).upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path };
}

/**
 * Resolve a storagePath to a renderable URL. Inline `data:`/`http` paths
 * (offline fallback) pass through; bucket paths get a fresh signed URL.
 */
export async function resolveFormPhotoUrl(storagePath: string): Promise<string> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) {
    return storagePath;
  }
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(FORM_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/** Best-effort removal of a stored photo/signature (no-op for inline/offline paths). */
export async function removeFormPhoto(storagePath: string): Promise<void> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) return;
  if (!hasSupabase()) return;
  const sb = getSupabase();
  await sb.storage.from(FORM_PHOTOS_BUCKET).remove([storagePath]);
}
