// Manual escape hatch for briefing generation. The automatic Vercel cron was
// disabled 2026-05-27: a Claude Code scheduled remote agent (routine
// trig_01R3cjtz9H7kPdThjtGxTNHX) now generates the briefing daily at 9am PT
// against Andrew's Max-plan usage, removing the per-call Anthropic API cost.
// This endpoint stays as a manual trigger. To re-enable the automatic cron,
// add a `crons` array to vercel.json:
//   { "crons": [{ "path": "/api/cron/daily-briefing", "schedule": "0 16 * * *" }] }
// (Do NOT add `$`-prefixed comment keys to vercel.json — they fail Vercel's
// schema verification and break every deploy.)
import { NextResponse } from "next/server";
import { generateBriefing } from "@features/briefing/lib/generateBriefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const briefing = await generateBriefing({ source: "cron" });
    return NextResponse.json({
      ok: true,
      id: briefing.id,
      items: briefing.items.length,
      jobs_considered: briefing.jobs_considered,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[cron/daily-briefing] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
