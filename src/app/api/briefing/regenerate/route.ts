import { NextResponse } from "next/server";
import { generateBriefing } from "@features/briefing/lib/generateBriefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const briefing = await generateBriefing({ source: "manual" });
    return NextResponse.json({
      ok: true,
      id: briefing.id,
      items: briefing.items.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[briefing/regenerate] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
