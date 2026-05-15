import type { Job } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";

export const BRIEFING_MODEL = "claude-sonnet-4-6";

import type Anthropic from "@anthropic-ai/sdk";

export const BRIEFING_TOOL: Anthropic.Tool = {
  name: "submit_briefing",
  description:
    "Submit the daily briefing for Good Woods cabinet jobs. Always call this exactly once.",
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
          "Between 0 and 10 jobs that need Andrew's attention today, ordered most important first. Skip healthy jobs.",
        items: {
          type: "object",
          properties: {
            job_id: { type: "string" },
            job_code: { type: "string" },
            job_name: { type: "string" },
            client: { type: "string" },
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
                "One sentence on why this is the headline. Cite the data (days since contact, margin %, install date).",
            },
            suggested_action: {
              type: "string",
              description:
                "One concrete next action Andrew can do today. Verb-first. e.g. 'Call client to confirm install date.'",
            },
          },
          required: [
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

YOUR TASK: Read the jobs JSON. Pick the 3-10 jobs that need attention today. Skip healthy jobs that are progressing on their normal cadence.

EXECUTION STEPS:
1. Read every job. For each, compute: days until install, days since last activity, margin %, current milestone vs. install date.
2. Flag any job where ANY of these are true:
   - install date is within 14 days and milestone is not yet "install"
   - install date is within 7 days and milestone is "materials" or earlier
   - install date is within 30 days and pipeline_status is still "new" or "sold" (not in production)
   - last activity is more than 10 days ago and pipeline is not "complete"
   - margin % is below 20 (band: blocked) and revenue > 5000
   - health_status is "at_risk" or "blocked"
   - pipeline_status is "complete" but install date is in the future (data hygiene)
3. Order them by urgency. Most-pressing first.
4. For each, write a six-to-ten-word HEADLINE, one-sentence REASON citing the actual data, and one concrete SUGGESTED ACTION.
5. Write a 2-3 sentence SUMMARY of today's shop reality.
6. Call the submit_briefing tool exactly once with the result.

RULES:
- Cite real numbers ("11 days since last activity", "install in 5 days", "margin at 17%"). No vague "this job needs attention".
- Suggested actions are verb-first and doable today: "Call Sarah to confirm tile spec", "Order side panels from Toolpath", "Update milestone to 'cut'".
- Do NOT include healthy on-track jobs as informational filler. If the day is quiet, return a short list and a calm summary.
- Tone: terse, owner-to-owner. No corporate copywriting. No exclamation marks.
- NEVER fabricate jobs or clients. Only cite jobs from the input.

VOICE EXAMPLE:
  headline: "Smith kitchen install in 5 days, still cutting"
  reason:   "Install scheduled 2026-05-12 but currentMilestone is 'cut'; 4 milestones still to clear."
  action:   "Block Saturday for assemble + finish, or push install to 2026-05-19."`;

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

export function buildUserMessage(
  jobsInput: JobInput[],
  today: Date
): string {
  return [
    `Today is ${today.toISOString().slice(0, 10)} (${today.toUTCString()}).`,
    `There are ${jobsInput.length} jobs in the system.`,
    ``,
    `JOBS_JSON:`,
    JSON.stringify(jobsInput, null, 2),
    ``,
    `Produce today's briefing now. Call submit_briefing exactly once.`,
  ].join("\n");
}
