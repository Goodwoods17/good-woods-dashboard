/** Upload guards for job drawings. Pure — no Supabase, no DOM. */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const ACCEPTED_UPLOAD_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UploadValidation = { ok: true } | { ok: false; reason: string };

const PRETTY_CAP = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;

export function validateUploadFile(file: { type: string; size: number }): UploadValidation {
  if (!ACCEPTED_UPLOAD_MIME.includes(file.type as (typeof ACCEPTED_UPLOAD_MIME)[number])) {
    return { ok: false, reason: "Only PDF or image files (JPG, PNG, WebP) can be uploaded." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `File is too large. Maximum is ${PRETTY_CAP}.` };
  }
  return { ok: true };
}

export function isPdf(mime: string | null | undefined): boolean {
  return mime === "application/pdf";
}
