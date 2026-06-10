/**
 * Photo upload + signed-URL helpers for the private `reface-photos` bucket.
 *
 * Browser-only (uses File / Image). Natural pixel dimensions are read before
 * upload because pin boxes are stored normalized (0..1) and rendered against the
 * displayed image, but the original aspect ratio is what keeps them aligned.
 * When Supabase isn't configured, photos fall back to inline data URLs so the
 * localStorage backend stays fully functional offline.
 */
import { getSupabase, hasSupabase } from "@shared/lib/supabase";

export const REFACE_PHOTOS_BUCKET = "reface-photos";

/** Signed-URL lifetime (1 hour) — long enough for an annotation session. */
const SIGNED_URL_TTL = 60 * 60;

export type NaturalSize = { width: number; height: number };

/** Read an image File's natural pixel size via an object URL. */
export function readImageSize(file: File): Promise<NaturalSize> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

function fileExt(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const ext = (fromName || file.type.split("/")[1] || "jpg").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

/** Read a File as a base64 data URL (localStorage fallback path). */
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export type UploadResult = { storagePath: string } & NaturalSize;

/**
 * Upload a photo for a project. With Supabase, stores under
 * `<projectId>/<photoId>.<ext>` and returns that path; without it, returns a
 * `data:` URL as the storagePath so the offline backend can render it directly.
 */
export async function uploadPhoto(
  projectId: string,
  photoId: string,
  file: File
): Promise<UploadResult> {
  const size = await readImageSize(file);

  if (!hasSupabase()) {
    const dataUrl = await readDataUrl(file);
    return { storagePath: dataUrl, ...size };
  }

  const sb = getSupabase();
  const path = `${projectId}/${photoId}.${fileExt(file)}`;
  const { error } = await sb.storage.from(REFACE_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return { storagePath: path, ...size };
}

/**
 * Resolve a storagePath to a renderable URL. Inline `data:`/`http` paths
 * (offline fallback) pass through; bucket paths get a fresh signed URL.
 */
export async function resolvePhotoUrl(storagePath: string): Promise<string> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) {
    return storagePath;
  }
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(REFACE_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

/** Best-effort removal of a stored photo (no-op for inline/offline paths). */
export async function removePhoto(storagePath: string): Promise<void> {
  if (storagePath.startsWith("data:") || storagePath.startsWith("http")) return;
  if (!hasSupabase()) return;
  const sb = getSupabase();
  await sb.storage.from(REFACE_PHOTOS_BUCKET).remove([storagePath]);
}
