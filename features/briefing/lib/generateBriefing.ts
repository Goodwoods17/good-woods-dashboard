import Anthropic from "@anthropic-ai/sdk";
import { CONTACTS_TABLE, JOBS_TABLE } from "@shared/lib/supabase";
import { rowToJob, type JobRow } from "@features/jobs/lib/jobsRowMap";
import {
  rowToContact,
  type ContactRow,
} from "@features/contacts/lib/contactsRowMap";
import { daysSince } from "@features/contacts/lib/aggregate";
import { STALE_THRESHOLD_DAYS } from "@features/contacts/components/WarmthChip";
import {
  BRIEFING_MODEL,
  BRIEFING_TOOL,
  SYSTEM_PROMPT,
  buildUserMessage,
  jobsToInput,
  type StaleAnchorInput,
} from "./prompt";
import { getServerSupabase, BRIEFINGS_TABLE } from "./serverSupabase";
import type { Briefing, BriefingItem, BriefingRow } from "./types";

export type GenerateOptions = {
  source: "cron" | "manual";
  today?: Date;
};

export async function generateBriefing(
  opts: GenerateOptions
): Promise<Briefing> {
  const today = opts.today ?? new Date();
  const supabase = getServerSupabase();

  const [
    { data: jobRows, error: jobsErr },
    { data: contactRows, error: contactsErr },
  ] = await Promise.all([
    supabase.from(JOBS_TABLE).select("*"),
    supabase.from(CONTACTS_TABLE).select("*"),
  ]);
  if (jobsErr) {
    throw new Error(`Failed to read jobs: ${jobsErr.message}`);
  }
  if (contactsErr) {
    throw new Error(`Failed to read contacts: ${contactsErr.message}`);
  }
  const jobs = ((jobRows as JobRow[] | null) ?? []).map(rowToJob);
  const openJobs = jobs.filter((j) => j.pipelineStatus !== "complete");
  const jobsInput = jobsToInput(openJobs, today);

  const contacts = ((contactRows as ContactRow[] | null) ?? []).map(rowToContact);
  const staleAnchors: StaleAnchorInput[] = contacts
    .filter((c) => c.isAnchor && !c.archivedAt)
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      roleTags: c.roleTags,
      lastTouchedAt: c.lastTouchedAt ?? null,
      daysSinceTouch: daysSince(c.lastTouchedAt, today),
    }))
    .filter((a) => a.daysSinceTouch === null || a.daysSinceTouch >= STALE_THRESHOLD_DAYS)
    .sort((a, b) => (b.daysSinceTouch ?? 9999) - (a.daysSinceTouch ?? 9999));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing.");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [BRIEFING_TOOL],
    tool_choice: { type: "tool", name: BRIEFING_TOOL.name },
    messages: [
      { role: "user", content: buildUserMessage(jobsInput, staleAnchors, today) },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Model did not call submit_briefing. Stop reason: ${response.stop_reason}`
    );
  }
  const input = toolUse.input as { summary: string; items: BriefingItem[] };

  const forDate = today.toISOString().slice(0, 10);
  const { data: inserted, error: insertErr } = await supabase
    .from(BRIEFINGS_TABLE)
    .insert({
      for_date: forDate,
      summary: input.summary,
      items: input.items,
      model: BRIEFING_MODEL,
      jobs_considered: openJobs.length,
      source: opts.source,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `Failed to insert briefing: ${insertErr?.message ?? "no row returned"}`
    );
  }

  return inserted as BriefingRow as Briefing;
}

export async function getLatestBriefing(): Promise<Briefing | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from(BRIEFINGS_TABLE)
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch briefing: ${error.message}`);
  return (data as BriefingRow | null) ?? null;
}
