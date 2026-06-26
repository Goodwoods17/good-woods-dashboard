import type { FormInstanceField } from "@shared/lib/types";
import { getFieldEntry } from "./fieldRegistry";
import { isFieldVisible } from "./conditionals";

/**
 * Completion logic for the lock + signoff slice (issue #35).
 *
 * Pure (no React, no Supabase) so the gate is unit-testable under the node
 * vitest env. The single source of truth is the field registry's per-type
 * `isComplete` check — completing a form means every field passes that gate
 * (a field is "required" via its `config.required`; layout sections and
 * optional-blank fields always pass). An unknown/forward-compat field type
 * has no registry entry, so it never blocks the lock.
 */

/** The fields still blocking a lock — every field whose registry gate fails. */
export function incompleteRequiredFields(fields: FormInstanceField[]): FormInstanceField[] {
  return fields.filter((f) => {
    // A hidden field auto-passes (conditionally invisible = not applicable).
    if (!isFieldVisible(f, fields)) return false;
    const entry = getFieldEntry(f.type);
    // Unknown/future types have no gate — treat them as satisfied (forward-compat).
    if (!entry) return false;
    return !entry.isComplete(f);
  });
}

/** True when every field passes its registry completion gate. */
export function isInstanceComplete(fields: FormInstanceField[]): boolean {
  return incompleteRequiredFields(fields).length === 0;
}

/** Safe, dated download filename for a signoff PDF (pure, testable). */
export function signoffFileName(title: string, completedAtIso: string): string {
  const slug =
    title
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "") || "form";
  const date = completedAtIso.slice(0, 10);
  return `${slug}_signoff_${date}.pdf`;
}
