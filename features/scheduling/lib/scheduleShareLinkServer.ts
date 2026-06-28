import { JOBS_TABLE, SCHEDULE_SHARE_LINKS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { loadCapabilityRow } from "@shared/lib/capabilityLink";
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

type JobScheduleRow = {
  name: string | null;
  current_milestone: MilestoneStage;
  install_date: string;
  phase_target_dates: PhaseTargetDates | null;
  /** S19: free-text blocker, passed through as a client action item. */
  blocker: string | null;
};

export type ClientScheduleBundle = {
  jobName: string;
  recipientName: string | null;
  view: ClientScheduleView;
};

export type ClientScheduleLoadResult =
  | { ok: true; bundle: ClientScheduleBundle }
  | { ok: false; reason: "not_found" | "revoked" | "unconfigured" };

export type LoadScheduleShareLinkOptions = {
  /**
   * Stamp `viewed_at` on first open. The human portal page passes true (a real
   * visit). The ICS feed (S21) passes FALSE — a subscribed calendar polls the
   * feed on its own schedule, and those background polls must NOT masquerade as
   * the client opening the portal.
   */
  stampView?: boolean;
};

/**
 * Load the client-safe schedule view behind a token. Rejects a revoked link with
 * a distinct reason (the page shows "no longer active", never data). Side effect:
 * stamps viewed_at on first open (best-effort; never fails the load) unless
 * `stampView` is false.
 */
export async function loadScheduleShareLink(
  token: string,
  options: LoadScheduleShareLinkOptions = {}
): Promise<ClientScheduleLoadResult> {
  const { stampView = true } = options;
  const sb = getServiceRoleClient();
  if (!sb) return { ok: false, reason: "unconfigured" };

  // Select-by-token → revoked check → stamp viewed_at on first view (unless the
  // ICS feed passed stampView:false so background polls don't masquerade as a visit).
  const res = await loadCapabilityRow<ScheduleShareLinkRow>(sb, SCHEDULE_SHARE_LINKS_TABLE, token, {
    stampView,
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const link = rowToScheduleShareLink(res.row);

  const { data: jobRow, error: jobErr } = await sb
    .from(JOBS_TABLE)
    .select("name, current_milestone, install_date, phase_target_dates, blocker")
    .eq("id", link.jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!jobRow) return { ok: false, reason: "not_found" };

  const job = jobRow as JobScheduleRow;

  const view = buildClientScheduleView({
    currentMilestone: job.current_milestone,
    installDate: job.install_date,
    committedDateSnapshot: link.committedDateSnapshot,
    phaseTargetDates: job.phase_target_dates,
    blocker: job.blocker,
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
