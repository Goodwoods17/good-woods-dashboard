import type { Job } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";

export const BRIEFING_MODEL = "claude-sonnet-4-6";

import type Anthropic from "@anthropic-ai/sdk";

export const BRIEFING_TOOL: Anthropic.Tool = {
  name: "submit_briefing",
  description:
    "Submit the daily briefing for Good Woods. Always call this exactly once. Items can be jobs needing attention or stale anchor relationships needing a touch.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "Two to three sentences of overall narrative for today. Concrete: what's the shop's day look like?",
      },
      items: {
        type: "array",
        description:
          "Between 0 and 10 items needing Andrew's attention today, ordered most important first. Skip healthy jobs. Mix jobs and stale-anchor relationship items by urgency.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["job", "relationship"],
              description:
                "job = a cabinet job needing attention; relationship = an anchor contact who has gone too long without a touch.",
            },
            job_id: {
              type: "string",
              description:
                "For job items: the job's id. For relationship items: pass the contact's id here too (the UI needs a stable key).",
            },
            job_code: {
              type: "string",
              description:
                "For job items: the job code (e.g. GW-2026-007). For relationship items: pass 'CRM' here.",
            },
            job_name: {
              type: "string",
              description:
                "For job items: the job name. For relationship items: pass the contact name here too.",
            },
            client: {
              type: "string",
              description:
                "For job items: the payer name. For relationship items: pass the contact name here too.",
            },
            contact_id: {
              type: "string",
              description: "Set on relationship items only. Contact's id.",
            },
            contact_name: {
              type: "string",
              description: "Set on relationship items only. Contact's name.",
            },
            severity: {
              type: "string",
              enum: ["red", "yellow", "green"],
              description:
                "red = action today or money/relationship at risk; yellow = watch; green = informational.",
            },
            headline: {
              type: "string",
              description: "Six to ten words. The thing.",
            },
            reason: {
              type: "string",
              description:
                "One sentence on why this is the headline. Cite the data (days since touch, margin %, install date).",
            },
            suggested_action: {
              type: "string",
              description:
                "One concrete next action Andrew can do today. Verb-first.",
            },
          },
          required: [
            "kind",
            "job_id",
            "job_code",
            "job_name",
            "client",
            "severity",
            "headline",
            "reason",
            "suggested_action",
          ],
        },
      },
    },
    required: ["summary", "items"],
  },
};

export const SYSTEM_PROMPT = `You are the daily-briefing engine for Good Woods, a small Victoria BC cabinet shop run by Andrew. You produce ONE briefing per day for Andrew, the owner-operator.

YOUR TASK: Read both the jobs JSON and the stale-anchor relationships JSON. Pick the 3-10 items that need attention today, mixing jobs and relationships ranked by urgency. Skip healthy jobs that are progressing on their normal cadence.

EXECUTION STEPS:
1. Read every job. For each, compute: days until install, days since last activity, margin %, current milestone vs. install date.
2. Flag any job where ANY of these are true:
   - install date is within 14 days and milestone is not yet "install"
   - install date is within 7 days and milestone is "materials" or earlier
   - install date is within 30 days and pipeline_status is still "new" or "sold" (not in production)
   - last activity is more than 14 days ago and pipeline is not "complete" (CLIENT FOLLOWUP TRIGGER — see step 2a)
   - margin % is below 20 (band: blocked) and revenue > 5000
   - health_status is "at_risk" or "blocked"
   - pipeline_status is "complete" but install date is in the future (data hygiene)
2a. Client followup rule: when the trigger is "last activity > 14 days" specifically and nothing else is firing, frame the item as a CLIENT-NUDGE not a project-blocker. Headline pattern: "<Client>. <N> days since last word. Check in." Suggested action is verb-first outreach: "Text <client> a quick how's-it-going about <project name>." This is the "auto-followup reminder" Andrew asked for — the dashboard reminding him to chase before clients feel forgotten.
3. Read every stale anchor. These are strategic relationships (designers who refer business, key GCs) that have not been touched in 30+ days. Each represents revenue risk if the relationship goes cold. Flag every one; the older the silence, the higher the urgency.
4. Order all flagged items by urgency. Most-pressing first. Anchor relationships compete with jobs on the same axis; an anchor at 60 days deserves "red" treatment over a job that's only mildly off track.
5. For each, write a six-to-ten-word HEADLINE, one-sentence REASON citing the actual data, and one concrete SUGGESTED ACTION.
6. Write a 2-3 sentence SUMMARY of today's shop reality.
7. Call the submit_briefing tool exactly once with the result.

JOB ITEMS:
- Set kind="job", fill job_id/job_code/job_name/client from the job. Leave contact_id/contact_name empty.

RELATIONSHIP ITEMS (stale anchors):
- Set kind="relationship". Fill contact_id and contact_name. Also mirror the contact id into job_id and the contact name into job_name and client; set job_code to "CRM" (the schema requires those fields, the UI uses kind to route the link).
- Headline pattern: "<Name>. <N> days since last touch. Pour <them/her/him> a coffee." e.g. "Raubyn. 47 days since last touch. Pour her a coffee."
- Suggested action: a specific outreach. "Send Raubyn the Allenby finish photos and ask about her next project."
- Severity: red if >60 days, yellow if 30-60 days, green never (don't surface healthy relationships).

RULES:
- Cite real numbers ("11 days since last activity", "install in 5 days", "margin at 17%", "47 days since last touch"). No vague "this needs attention".
- Suggested actions are verb-first and doable today.
- Do NOT include healthy on-track jobs or fresh relationships as informational filler. If the day is quiet, return a short list and a calm summary.
- Tone: terse, owner-to-owner. No corporate copywriting. No exclamation marks.
- NEVER use em dashes anywhere in headline, reason, or suggested_action. Use periods, commas, colons, semicolons, or parentheses instead. This is a hard styling rule.
- NEVER fabricate jobs, contacts, or numbers. Only cite items from the input.

VOICE EXAMPLES:
  job (deadline):
    headline: "Smith kitchen install in 5 days, still cutting"
    reason:   "Install scheduled 2026-05-12 but currentMilestone is cut; 4 milestones still to clear."
    action:   "Block Saturday for assemble + finish, or push install to 2026-05-19."
  job (client followup, no other trigger):
    headline: "Allenby. 18 days since last word. Check in."
    reason:   "Last activity 2026-05-07. Install in 41 days. They're due a gut-check before drywall closes up."
    action:   "Text Sarah a quick photo of the finish samples and ask if anything's changed on her end."
  relationship:
    headline: "Raubyn. 47 days since last touch. Pour her a coffee."
    reason:   "Anchor designer, last touched 2026-04-08. 30% of trailing-twelve revenue traces back to her referrals."
    action:   "Send the Allenby finish photos and ask what's on her board for September."`;

export type JobInput = {
  id: string;
  code: string;
  name: string;
  client: string;
  pipelineStatus: string;
  healthStatus: string;
  currentMilestone: string;
  installDate: string;
  revenue: number;
  marginPct: number;
  costsTotal: number;
  notes: string;
  lastActivityAt: string | null;
  lastActivityMessage: string | null;
  daysSinceLastActivity: number | null;
  daysUntilInstall: number;
};

export function jobsToInput(jobs: Job[], today: Date): JobInput[] {
  return jobs.map((job) => {
    const margin = computeMargin(job);
    const installDate = new Date(job.installDate);
    const daysUntilInstall = Math.round(
      (installDate.getTime() - today.getTime()) / 86_400_000
    );
    const lastActivity = (job.activity ?? [])
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const daysSinceLastActivity = lastActivity
      ? Math.round(
          (today.getTime() - new Date(lastActivity.timestamp).getTime()) /
            86_400_000
        )
      : null;
    return {
      id: job.id,
      code: job.code,
      name: job.name,
      client: job.client,
      pipelineStatus: job.pipelineStatus,
      healthStatus: job.healthStatus,
      currentMilestone: job.currentMilestone,
      installDate: job.installDate,
      revenue: job.revenue,
      marginPct: Math.round(margin.marginPct * 10) / 10,
      costsTotal: margin.costsTotal,
      notes: (job.notes ?? "").slice(0, 400),
      lastActivityAt: lastActivity?.timestamp ?? null,
      lastActivityMessage: lastActivity?.message ?? null,
      daysSinceLastActivity,
      daysUntilInstall,
    };
  });
}

export type StaleAnchorInput = {
  id: string;
  name: string;
  kind: "person" | "org";
  roleTags: string[];
  lastTouchedAt: string | null;
  daysSinceTouch: number | null;
};

export function buildUserMessage(
  jobsInput: JobInput[],
  staleAnchors: StaleAnchorInput[],
  today: Date
): string {
  return [
    `Today is ${today.toISOString().slice(0, 10)} (${today.toUTCString()}).`,
    `There are ${jobsInput.length} open jobs and ${staleAnchors.length} stale anchor relationship${staleAnchors.length === 1 ? "" : "s"}.`,
    ``,
    `JOBS_JSON:`,
    JSON.stringify(jobsInput, null, 2),
    ``,
    `STALE_ANCHORS_JSON:`,
    JSON.stringify(staleAnchors, null, 2),
    ``,
    `Produce today's briefing now. Call submit_briefing exactly once.`,
  ].join("\n");
}
