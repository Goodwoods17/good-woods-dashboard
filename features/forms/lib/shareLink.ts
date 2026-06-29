import type { FormInstanceField, FormShareLink } from "@shared/lib/types";
import { generateCapabilityToken } from "@shared/lib/capabilityToken";
import { getFieldEntry } from "./fieldRegistry";
import { isFieldVisible } from "./conditionals";

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
 * Mint an opaque, url-safe token (>=32 chars). Thin alias over the consolidated
 * `generateCapabilityToken` (ADR 0022) — the single token source every no-login
 * capability link now shares. Kept as a named re-export so existing Forms call
 * sites (`formInstancesStore`) need no churn.
 */
export function generateShareToken(): string {
  return generateCapabilityToken();
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
    // Hidden fields are excluded from the progress meter.
    if (!isFieldVisible(f, fields)) return false;
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

/**
 * Returns the subset of VISIBLE, REQUIRED fields whose registry `isComplete`
 * returns false. Used for the public submit soft-warn: "these fields are blank,
 * but you can still submit." Excludes layout fields (sections) and hidden fields
 * (Slice-1 showWhen). Excludes non-required fields (optional blank is fine).
 */
export function missingVisibleRequiredFields(fields: FormInstanceField[]): FormInstanceField[] {
  return fields.filter((f) => {
    if (!isFieldVisible(f, fields)) return false;
    const entry = getFieldEntry(f.type);
    if (!entry || entry.isLayout) return false;
    // Only flag fields explicitly marked required AND currently incomplete.
    const isRequired = (f.config as Record<string, unknown>)?.required === true;
    if (!isRequired) return false;
    return !entry.isComplete(f);
  });
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
