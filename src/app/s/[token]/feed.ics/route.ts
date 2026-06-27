import { type NextRequest } from "next/server";
import { loadScheduleShareLink } from "@features/scheduling/lib/scheduleShareLinkServer";
import { buildClientCalendar } from "@features/scheduling/lib/clientCalendar";
import { schedulingEnabled } from "@features/scheduling/lib/featureFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, no-login subscribable ICS feed for ONE job behind a share token
 * (S21, issue #109). The token is the capability; the service-role read is
 * scoped to its one job, and the feed mirrors EXACTLY what the portal shows
 * (firm install + fuzzed week ranges — never buffer / internal targets / fever).
 *
 * Calendar apps subscribe to `webcal://…/s/<token>/feed.ics` and re-poll on
 * their own schedule; a stable per-token UID per event means a shifted date
 * updates the event IN PLACE rather than duplicating. The portal is the source
 * of truth and the feed lags by design, so every committed-date change is paired
 * with an immediate email.
 *
 * Gated by NEXT_PUBLIC_SCHEDULING_ENABLED — 404s when off so prod stays dormant.
 * Any miss (unknown / revoked / unconfigured token) is a flat 404: never leak
 * whether a token ever existed.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  if (!schedulingEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  // Background calendar polls must NOT count as the client opening the portal.
  const result = await loadScheduleShareLink(params.token, { stampView: false });
  if (!result.ok) {
    return new Response("Not found", { status: 404 });
  }

  const { jobName, view } = result.bundle;
  const origin = request.nextUrl.origin;
  const ics = buildClientCalendar({ jobName, token: params.token, view, origin });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Inline so webcal subscribers parse it; a friendly filename for downloads.
      "Content-Disposition": 'inline; filename="good-woods-schedule.ics"',
      // Short cache: the feed must reflect a date shift within minutes, but a
      // burst of subscriber polls shouldn't each hit the DB.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
