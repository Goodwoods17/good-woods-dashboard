import type { FormInstanceField, FormShareLink } from "@shared/lib/types";
import { getFieldEntry } from "./fieldRegistry";

/**
 * Share-link token model + the server-side lock enforcement. Pure (no React, no
 * Supabase) so the security-critical bits are unit-testable under the node
 * vitest env. The /f/<token> route imports these; the public submit path runs
 * `filterLockedAnswers` BEFORE writing, so a token holder can never edit a field
 * the owner locked — enforced server-side, not merely hidden in the UI.
 */

/** One incoming answer patch, keyed by instance-field id, from the public page. */
export type ShareAnswerPatch = {
  checked?: boolean | null;
  value?: unknown;
  note?: string | null;
};

export type ShareAnswers = Record<string, ShareAnswerPatch>;

/**
 * Mint an opaque, url-safe token (>=32 chars). Uses Web Crypto (available in the
 * Edge + Node runtimes and the browser) so there's no Node-only dependency.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url, no padding — url-safe and opaque.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A link is usable until it is manually revoked. No expiry (jobs outlast 30 days). */
export function isShareLinkActive(link: FormShareLink): boolean {
  return link.revokedAt === null;
}

/**
 * The single security gate: drop any incoming answer whose field id is (a) not a
 * real field of this instance, or (b) in the link's lockedFieldIds. Returns only
 * the answers safe to persist. The caller writes EXACTLY this filtered set.
 */
export function filterLockedAnswers(
  incoming: ShareAnswers,
  link: FormShareLink,
  fields: FormInstanceField[]
): ShareAnswers {
  const validIds = new Set(fields.map((f) => f.id));
  const locked = new Set(link.lockedFieldIds);
  const out: ShareAnswers = {};
  for (const [id, patch] of Object.entries(incoming)) {
    if (!validIds.has(id)) continue; // not part of this instance
    if (locked.has(id)) continue; // owner-locked → read-only for this recipient
    out[id] = patch;
  }
  return out;
}

/**
 * Owner-visible completion percentage (0..100) for an instance's fields, used
 * for the share-link `progress` column. Counts only ANSWERABLE fields (layout
 * fields like section headings are excluded) and reuses the registry's per-type
 * `isComplete` so "filled" means the same thing here as on the completion gate.
 * Returns 0 when there are no answerable fields (avoids NaN).
 */
export function computeProgress(fields: FormInstanceField[]): number {
  const answerable = fields.filter((f) => {
    const entry = getFieldEntry(f.type);
    return entry ? !entry.isLayout : false;
  });
  if (answerable.length === 0) return 0;
  const done = answerable.filter((f) => {
    const entry = getFieldEntry(f.type);
    return entry ? entry.isComplete(f) : false;
  }).length;
  return Math.round((done / answerable.length) * 100);
}

/** Which locked ids an incoming payload tried (and was forbidden) to set — for diagnostics/audit. */
export function lockedAnswerKeys(
  incoming: ShareAnswers,
  link: FormShareLink,
  fields: FormInstanceField[]
): string[] {
  const validIds = new Set(fields.map((f) => f.id));
  const locked = new Set(link.lockedFieldIds);
  return Object.keys(incoming).filter((id) => validIds.has(id) && locked.has(id));
}
