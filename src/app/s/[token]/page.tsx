import { loadScheduleShareLink } from "@features/scheduling/lib/scheduleShareLinkServer";
import { ClientScheduleView } from "@features/scheduling/components/ClientScheduleView";
import { ClientScheduleInactive } from "@features/scheduling/components/ClientScheduleInactive";
import { schedulingEnabled } from "@features/scheduling/lib/featureFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A revoked token must kill access on the next request — no stale-cache window.
// Belt-and-suspenders with the next.config.mjs Cache-Control: no-store header (S13).
export const fetchCache = "force-no-store";

// The public, no-login client schedule portal (S18, issue #106). Thin: load the
// one job's CLIENT-SAFE schedule view behind the token server-side (service role,
// scoped by token), then render it. A missing / revoked token shows a clean
// inactive state, never data. Gated by NEXT_PUBLIC_SCHEDULING_ENABLED — when off
// the route 404s so prod stays dormant until the owner flips the flag.
export default async function ClientSchedulePage({ params }: { params: { token: string } }) {
  if (!schedulingEnabled()) {
    return <ClientScheduleInactive reason="not_found" />;
  }

  const result = await loadScheduleShareLink(params.token);

  if (!result.ok) {
    return <ClientScheduleInactive reason={result.reason} />;
  }

  const { jobName, recipientName, view } = result.bundle;
  return (
    <ClientScheduleView
      jobName={jobName}
      recipientName={recipientName}
      view={view}
      token={params.token}
    />
  );
}
