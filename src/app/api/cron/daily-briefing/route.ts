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
