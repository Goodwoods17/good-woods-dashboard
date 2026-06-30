import "server-only";
import { JOBS_TABLE, SHARE_TOKENS_TABLE } from "@shared/lib/supabase";
import { getServiceRoleClient } from "@shared/lib/serviceClient";
import { loadCapabilityRow } from "@shared/lib/capabilityLink";
import { type ShareTokenRow } from "@shared/lib/shareTokensRowMap";
import type { MilestoneStage } from "@shared/lib/types";
import { shareTokenRowToScheduleShareLink } from "./scheduleShareTokenMap";
import { buildClientScheduleView, type ClientScheduleView } from "./clientPortal";
import type { PhaseTargetDates } from "./schedule";

/**
 * Server-only data access for the no-login /s/<token> client schedule portal
 * (S18, issue #106). Uses the SERVICE ROLE key, but every read is scoped to the
 * ONE job behind the token — the token is the capability. The public anon client
 * is never used here; the *_anon_none policy denies share_tokens entirely.
 * Reads SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_*), so this
 * module is only ever imported by the server route under src/app/s.
 *
 * S5a (milestone #12, ADR 0022): the read is CUT to the generalized
 * `share_tokens` registry (capability_type=schedule), scoped so a foreign-type
 * token reads as not_found. The legacy `schedule_share_links` table is still
 * dual-written by the owner store during the overlap, but nothing READS it here
 * anymore — it is kept only until the S5b Forms retrofit proves the mechanics.
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

  // Select-by-token (scoped to capability_type=schedule so a foreign-type token
  // reads as not_found) → revoked check → stamp viewed_at on first view (unless
  // the ICS feed passed stampView:false so background polls don't masquerade as
  // a visit). The first-view guard inside loadCapabilityRow preserves viewed_at
  // verbatim once stamped (S18 read-receipt semantics, unchanged by the retrofit).
  const res = await loadCapabilityRow<ShareTokenRow>(sb, SHARE_TOKENS_TABLE, token, {
    stampView,
    capabilityType: "schedule",
  });
  // Schedule links are minted with expires_at NULL (never expire), so the
  // generalized "expired" reason is unreachable here; collapse it into not_found.
  if (!res.ok) return { ok: false, reason: res.reason === "expired" ? "not_found" : res.reason };

  const link = shareTokenRowToScheduleShareLink(res.row);

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
