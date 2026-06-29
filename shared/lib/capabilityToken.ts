/**
 * The single opaque-token generator for every no-login capability link (ADR
 * 0022). Both per-feature share tables minted tokens with byte-identical code
 * (`generateShareToken` in Forms, an inline copy in Scheduling); this is the one
 * consolidated source so the registry — and any new capability type — shares it.
 *
 * The token is a 32-byte (256-bit) cryptographically-random value, base64url
 * with no padding: url-safe and opaque (no information leaked, no guessable
 * sequence). 32 bytes → 43 base64url chars, comfortably the ">=32 chars" the DB
 * column expects. Uses Web Crypto so there is no Node-only dependency — it runs
 * in the Edge + Node runtimes and the browser identically.
 */
export function generateCapabilityToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  // base64url, no padding — url-safe and opaque.
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
