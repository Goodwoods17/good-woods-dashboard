import "server-only";
import { JOBS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";

/**
 * Server-only helpers shared by the document portal data paths
 * (`documentShareServer`, `documentRequestServer`, `documentWatermarkServer`).
 * Hoisted here so the security-relevant column allow-list and the job→contact
 * derivation live in ONE place — a drift between copies is exactly the risk this
 * consolidation removes. Server-only: these run under the service role and must
 * never reach the client bundle.
 */

/**
 * The explicit, audited document column list — NEVER `*` on a public path.
 * Duplicating this string across the portal readers risked one copy drifting to
 * expose an internal column; keep it single-sourced.
 */
export const DOC_COLUMNS =
  "id, project_id, kind, label, drive_url, version, is_current, notes, uploaded_by, created_at, source, storage_path, mime, page_count";

/** The who-to-call contact card shape — derived from the job, never client-supplied. */
export type PortalContact = { name: string; phone: string | null; email: string | null } | null;

/**
 * Resolve the job name + who-to-call contact for a portal, from the job → payer
 * contact chain. Service-role read of just the display fields (never `*`).
 */
export async function loadJobContact(
  sb: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  jobId: string
): Promise<{ jobName: string; contact: PortalContact }> {
  const { data: jobRow } = await sb
    .from(JOBS_TABLE)
    .select("name, payer_id")
    .eq("id", jobId)
    .maybeSingle();
  const job = jobRow as { name: string | null; payer_id: string | null } | null;
  const jobName = job?.name ?? "Your project";

  if (!job?.payer_id) return { jobName, contact: null };
  const { data: contactRow } = await sb
    .from("contacts")
    .select("name, emails, phones")
    .eq("id", job.payer_id)
    .maybeSingle();
  const c = contactRow as { name: string | null; emails: unknown; phones: unknown } | null;
  if (!c?.name) return { jobName, contact: null };
  return {
    jobName,
    contact: { name: c.name, phone: firstString(c.phones), email: firstString(c.emails) },
  };
}

/** First non-empty string in a jsonb array column (contacts.emails / .phones). */
export function firstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const v of value) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "string") {
      const s = (v as { value: string }).value.trim();
      if (s) return s;
    }
  }
  return null;
}
