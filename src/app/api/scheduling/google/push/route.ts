import { NextResponse, type NextRequest } from "next/server";
import { schedulingP6Enabled } from "@features/scheduling/lib/featureFlag";
import { pushJobSchedule } from "@features/scheduling/lib/googleCalendarServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push one job's schedule one-way into the connected Google Calendar (S23).
 * Gated on the P6 flag (404) + auth middleware. Idempotent: create on first
 * push, patch on date move, delete on a removed target. Degrades cleanly:
 *   – 503 `unconfigured` when OAuth creds / encryption key are absent
 *   – 409 `not_connected` when no Google account is wired
 *   – 404 `job_not_found` for an unknown job
 * POST body: { jobId: string }.
 */
export async function POST(request: NextRequest) {
  if (!schedulingP6Enabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  const jobId = body.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, reason: "missing_job_id" }, { status: 400 });
  }

  const result = await pushJobSchedule(jobId);
  if (result.ok) {
    return NextResponse.json(result);
  }

  const status =
    result.reason === "unconfigured"
      ? 503
      : result.reason === "not_connected"
        ? 409
        : result.reason === "job_not_found"
          ? 404
          : 502;
  return NextResponse.json({ ok: false, reason: result.reason }, { status });
}
