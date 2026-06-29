import { NextResponse, type NextRequest } from "next/server";
import { recordFurthestPage } from "@features/documents/lib/documentShareServer";
import { projectFilesEnabled } from "@shared/lib/projectFilesFlag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, no-login engagement beacon for the document VIEW portal (S2). The
 * portal fires this on view to record the furthest page the recipient reached
 * (`share_tokens.state.furthestPage`, monotonic). It is ANALYTICS ONLY — scoped
 * to the one token row, clamped server-side, never trusted for access. A flat
 * 204 in every case so it leaks nothing about whether the token exists; gated by
 * the feature flag so prod stays dormant until the owner flips it.
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  if (!projectFilesEnabled()) return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json().catch(() => ({}))) as { page?: unknown };
    const page = typeof body.page === "number" ? body.page : Number(body.page);
    if (Number.isFinite(page)) await recordFurthestPage(params.token, page);
  } catch {
    /* analytics only — swallow */
  }
  return new NextResponse(null, { status: 204 });
}
