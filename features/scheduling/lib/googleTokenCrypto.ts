import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Symmetric encryption for the Google OAuth **refresh token** stored at rest
 * (S23, issue #111). The refresh token is a long-lived credential — it MUST NOT
 * sit in the database in plaintext. We encrypt it server-side with AES-256-GCM
 * keyed by the `GOOGLE_TOKEN_ENC_KEY` env secret (never shipped to the client),
 * and store only the ciphertext blob in `scheduling_google_connections`.
 *
 * AES-256-GCM gives us authenticated encryption: any tampering with the stored
 * blob fails the auth-tag check on decrypt rather than silently returning
 * garbage. The 256-bit key is derived from the (arbitrary-length) env secret via
 * SHA-256 so operators can use any sufficiently-random string.
 *
 * Pure Node `crypto` — no new dependency, runs server-side only (the OAuth
 * callback + push routes), never bundled into the client.
 */

const ALGO = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** True only when a usable (non-blank) encryption secret is configured. */
export function tokenEncryptionConfigured(secret: string | undefined | null): boolean {
  return typeof secret === "string" && secret.trim().length > 0;
}

/**
 * Encrypt a token. Returns a self-describing string `iv.tag.ciphertext`
 * (all base64). A fresh random 96-bit IV per call means identical plaintexts
 * encrypt to different blobs.
 */
export function encryptToken(plaintext: string, secret: string): string {
  if (!tokenEncryptionConfigured(secret)) {
    throw new Error("encryptToken: missing encryption secret");
  }
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/**
 * Decrypt a blob produced by {@link encryptToken}. Throws if the secret is
 * wrong, the payload is malformed, or the ciphertext/tag has been tampered with.
 */
export function decryptToken(payload: string, secret: string): string {
  if (!tokenEncryptionConfigured(secret)) {
    throw new Error("decryptToken: missing encryption secret");
  }
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("decryptToken: malformed payload");
  }
  const [ivB64, tagB64, encB64] = parts;
  const key = deriveKey(secret);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("decryptToken: malformed payload");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
