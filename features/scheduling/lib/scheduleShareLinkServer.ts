import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { JOBS_TABLE, SCHEDULE_SHARE_LINKS_TABLE } from "@shared/lib/supabase";
import type { MilestoneStage } from "@shared/lib/types";
import { rowToScheduleShareLink, type ScheduleShareLinkRow } from "./scheduleShareLinksRowMap";
import { buildClientScheduleView, type ClientScheduleView } from "./clientPortal";
import type { PhaseTargetDates } from "./schedule";

/**
 * Server-only data access for the no-login /s/<token> client schedule portal
 * (S18, issue #106). Uses the SERVICE ROLE key, but every read is scoped to the
 * ONE job behind the token — the token is the capability. The public anon client
 * is never used here; the *_anon_none policy denies schedule_share_links
 * entirely. Reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_*),
 * so this module is only ever imported by the server route under src/app/s.
 *
 * It returns ONLY the client-safe computed view (buildClientScheduleView) plus a
 * job display name — the buffer, internal targets, and fever data never leave
 * the server.
 */

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // The committed date can move between visits (a re-commit). These reads
      // must be live, so opt out of Next.js' fetch Data Cache (force-cache).
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return serviceClient;
}

type JobScheduleRow = {
  name: string | null;
  current_milestone: MilestoneStage;
  install_date: string;
  phase_target_dates: PhaseTargetDates | null;
};

export type ClientScheduleBundle = {
  jobName: string;
  recipientName: string | null;
  view: ClientScheduleView;
};

export type ClientScheduleLoadResult =
  | { ok: true; bundle: ClientScheduleBundle }
  | { ok: false; reason: "not_found" | "revoked" | "unconfigured" };

/**
 * Load the client-safe schedule view behind a token. Rejects a revoked link with
 * a distinct reason (the page shows "no longer active", never data). Side effect:
 * stamps viewed_at on first open (best-effort; never fails the load).
 */
export async function loadScheduleShareLink(token: string): Promise<ClientScheduleLoadResult> {
  const sb = getServiceClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  const { data: linkRow, error: linkErr } = await sb
    .from(SCHEDULE_SHARE_LINKS_TABLE)
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!linkRow) return { ok: false, reason: "not_found" };

  const link = rowToScheduleShareLink(linkRow as ScheduleShareLinkRow);
  if (link.revokedAt !== null) return { ok: false, reason: "revoked" };

  const { data: jobRow, error: jobErr } = await sb
    .from(JOBS_TABLE)
    .select("name, current_milestone, install_date, phase_target_dates")
    .eq("id", link.jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!jobRow) return { ok: false, reason: "not_found" };

  const job = jobRow as JobScheduleRow;

  // First view stamps viewed_at (best-effort; don't fail the load on a write error).
  if (link.viewedAt === null) {
    await sb
      .from(SCHEDULE_SHARE_LINKS_TABLE)
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", link.id);
  }

  const view = buildClientScheduleView({
    currentMilestone: job.current_milestone,
    installDate: job.install_date,
    committedDateSnapshot: link.committedDateSnapshot,
    phaseTargetDates: job.phase_target_dates,
  });

  return {
    ok: true,
    bundle: {
      jobName: job.name ?? "Your project",
      recipientName: link.recipientName,
      view,
    },
  };
}
