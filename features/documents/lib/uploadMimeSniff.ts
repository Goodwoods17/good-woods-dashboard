/**
 * Magic-byte MIME sniffing for the no-login designer UPLOAD portal (S11, ADR
 * 0022 · milestone #12). The writing token route NEVER trusts the client-sent
 * `file.type` — a malicious uploader can label an executable `image/png`. The
 * real content type is derived from the leading bytes and matched against a
 * strict allow-list; anything that doesn't sniff to an allow-listed type is
 * rejected before the storage write.
 *
 * Pure + dependency-free (no `file-type` package) so it runs identically in the
 * Node route handler and in unit tests. Only the handful of types a designer
 * actually sends (drawings + photos) are recognised — deliberately NARROW.
 */

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

/** Does `b` start with the given byte signature (at `offset`)? */
function hasSig(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (b[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Sniff the true MIME from the leading bytes. Returns null when the content is
 * not one of the recognised real types (an unknown / spoofed file). A RIFF
 * container is only `image/webp` when its form-type tag at offset 8 is "WEBP"
 * (a WAV / AVI RIFF is rejected).
 */
export function sniffMime(bytes: Uint8Array): AllowedUploadMime | null {
  // %PDF
  if (hasSig(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  // PNG 8-byte signature
  if (hasSig(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // JPEG SOI + marker
  if (hasSig(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // WEBP: "RIFF"...."WEBP"
  if (hasSig(bytes, [0x52, 0x49, 0x46, 0x46]) && hasSig(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** Is the sniffed value an allow-listed upload type? (null → false.) */
export function isAllowedUploadMime(mime: string | null): mime is AllowedUploadMime {
  return mime !== null && (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

/** Server-chosen file extension for the SNIFFED type (never the client name). */
export function uploadExtensionFor(mime: AllowedUploadMime): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
  }
}
