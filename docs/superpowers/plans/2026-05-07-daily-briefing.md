# Daily Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an AI-generated daily briefing for Good Woods Dashboard — a 9am Pacific cron that scans all open jobs and surfaces the 3–10 that need attention today, why, and what to do next. Lands as a new `/briefing` route plus a homepage card.

**Architecture:** Vercel cron → Next.js API route → reads `jobs` from Supabase → calls Anthropic API with `tool_use` for structured output → writes a row to a new `briefings` Supabase table → `/briefing` page renders the latest row. Manual "regenerate" button calls the same generator. No new local infrastructure; everything runs in Vercel.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (postgres + RLS), `@anthropic-ai/sdk`, `claude-sonnet-4-6`, Vercel Cron, existing Tailwind tokens.

**Why this design (vs. Alyssa's CRM):**
- Notion → already replaced by Supabase (jobs is the Client Intelligence Hub equivalent)
- Slack → replaced by in-app `/briefing` + homepage card (Andrew works in the dashboard)
- Local Claude Code + Co-work cron → replaced by Vercel cron (no laptop dependency)
- One agent, not three — premature to split until we hit context/regression problems she did

---

## Task 1: Add `briefings` table to Supabase

**Files:**
- Create: `supabase/migrations/20260507_briefings.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260507_briefings.sql`:

```sql
-- Daily briefing rows: one per generation run.
create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  for_date date not null,
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  model text not null,
  jobs_considered int not null default 0,
  error text,
  source text not null default 'cron' -- 'cron' | 'manual'
);

create index if not exists briefings_for_date_idx
  on public.briefings (for_date desc, generated_at desc);

-- RLS: anon can read, only service-role can write.
alter table public.briefings enable row level security;

create policy "anon read briefings"
  on public.briefings for select
  to anon
  using (true);

-- (no insert/update/delete policy for anon — only service role can write)
```

- [ ] **Step 2: Apply the migration in Supabase SQL editor**

Open https://supabase.com/dashboard/project/zycdmlkffbaqofaygddx/sql/new
Paste the contents of `supabase/migrations/20260507_briefings.sql` and run it.

Then run, in a new SQL query: `notify pgrst, 'reload schema';`

Verification: in Supabase Table Editor, confirm `briefings` exists with columns `id`, `generated_at`, `for_date`, `summary`, `items`, `model`, `jobs_considered`, `error`, `source`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260507_briefings.sql
git commit -m "feat(briefing): add briefings table migration"
```

---

## Task 2: Install Anthropic SDK and add env vars

**Files:**
- Modify: `package.json`
- Manual: Vercel project env vars + local `.env.local`

- [ ] **Step 1: Install the SDK**

```bash
cd "C:\Users\andre\Desktop\Andrew Vibes\good-woods-dashboard"
npm install @anthropic-ai/sdk
```

Verification: `package.json` should now list `"@anthropic-ai/sdk"` in dependencies, and `package-lock.json` updated.

- [ ] **Step 2: Add new env vars locally**

Append to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=<generate via: openssl rand -hex 32>
```

Get values from:
- `ANTHROPIC_API_KEY`: https://console.anthropic.com/settings/keys
- `SUPABASE_SERVICE_ROLE_KEY`: https://supabase.com/dashboard/project/zycdmlkffbaqofaygddx/settings/api → "service_role" key
- `CRON_SECRET`: any random string. From PowerShell: `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`

- [ ] **Step 3: Add the same env vars in Vercel**

```bash
vercel env add ANTHROPIC_API_KEY production
vercel env add ANTHROPIC_API_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
vercel env add CRON_SECRET production
vercel env add CRON_SECRET preview
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(briefing): add @anthropic-ai/sdk dependency"
```

---

## Task 3: Create types and prompt module

**Files:**
- Create: `features/briefing/lib/types.ts`
- Create: `features/briefing/lib/prompt.ts`

- [ ] **Step 1: Write `features/briefing/lib/types.ts`**

```ts
export type BriefingSeverity = "red" | "yellow" | "green";

export type BriefingItem = {
  job_id: string;
  job_code: string;
  job_name: string;
  client: string;
  severity: BriefingSeverity;
  headline: string;
  reason: string;
  suggested_action: string;
};

export type Briefing = {
  id: string;
  generated_at: string;
  for_date: string;
  summary: string;
  items: BriefingItem[];
  model: string;
  jobs_considered: number;
  error: string | null;
  source: "cron" | "manual";
};

export type BriefingRow = {
  id: string;
  generated_at: string;
  for_date: string;
  summary: string;
  items: BriefingItem[];
  model: string;
  jobs_considered: number;
  error: string | null;
  source: "cron" | "manual";
};

export function rowToBriefing(row: BriefingRow): Briefing {
  return { ...row };
}
```

- [ ] **Step 2: Write `features/briefing/lib/prompt.ts`**

```ts
import type { Job } from "@shared/lib/types";
import { computeMargin } from "@shared/lib/types";

export const BRIEFING_MODEL = "claude-sonnet-4-6";

export const BRIEFING_TOOL = {
  name: "submit_briefing",
  description:
    "Submit the daily briefing for Good Woods cabinet jobs. Always call this exactly once.",
  input_schema: {
    type: "object" as const,
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
} as const;

export const SYSTEM_PROMPT = `You are the daily-briefing engine for Good Woods, a small Victoria BC cabinet shop run by Andrew. You produce ONE briefing per day for Andrew, the owner-operator.

YOUR TASK: Read the jobs JSON. Pick the 3–10 jobs that need attention today. Skip healthy jobs that are progressing on their normal cadence.

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
5. Write a 2–3 sentence SUMMARY of today's shop reality.
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add features/briefing/lib/types.ts features/briefing/lib/prompt.ts
git commit -m "feat(briefing): add types and agent prompt"
```

---

## Task 4: Build the generate function

**Files:**
- Create: `features/briefing/lib/serverSupabase.ts`
- Create: `features/briefing/lib/generateBriefing.ts`

- [ ] **Step 1: Write `features/briefing/lib/serverSupabase.ts`**

Server-side Supabase client using the service role key. Used by API routes only — never imported by client code.

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (serverClient) return serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Server Supabase missing config. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  serverClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

export const BRIEFINGS_TABLE = "briefings";
```

- [ ] **Step 2: Write `features/briefing/lib/generateBriefing.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { JOBS_TABLE } from "@shared/lib/supabase";
import { rowToJob, type JobRow } from "@features/jobs/lib/jobsRowMap";
import {
  BRIEFING_MODEL,
  BRIEFING_TOOL,
  SYSTEM_PROMPT,
  buildUserMessage,
  jobsToInput,
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

  // 1. Read jobs from Supabase.
  const { data: rows, error: jobsErr } = await supabase
    .from(JOBS_TABLE)
    .select("*");
  if (jobsErr) {
    throw new Error(`Failed to read jobs: ${jobsErr.message}`);
  }
  const jobs = (rows as JobRow[] | null ?? []).map(rowToJob);
  const openJobs = jobs.filter((j) => j.pipelineStatus !== "complete");
  const jobsInput = jobsToInput(openJobs, today);

  // 2. Call Anthropic.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing.");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [BRIEFING_TOOL],
    tool_choice: { type: "tool", name: BRIEFING_TOOL.name },
    messages: [{ role: "user", content: buildUserMessage(jobsInput, today) }],
  });

  // 3. Extract the tool call.
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Model did not call submit_briefing. Stop reason: ${response.stop_reason}`
    );
  }
  const input = toolUse.input as { summary: string; items: BriefingItem[] };

  // 4. Persist row.
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add features/briefing/lib/serverSupabase.ts features/briefing/lib/generateBriefing.ts
git commit -m "feat(briefing): add generateBriefing function"
```

---

## Task 5: Smoke-test the agent locally

**Files:**
- Create: `scripts/test-briefing.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Add the smoke-test script**

Create `scripts/test-briefing.ts`:

```ts
/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });

import { generateBriefing } from "../features/briefing/lib/generateBriefing";

async function main() {
  console.log("Generating briefing (source=manual)...");
  const briefing = await generateBriefing({ source: "manual" });
  console.log("\n=== SUMMARY ===");
  console.log(briefing.summary);
  console.log(`\n=== ITEMS (${briefing.items.length}) ===`);
  for (const item of briefing.items) {
    console.log(
      `[${item.severity.toUpperCase()}] ${item.job_code} ${item.job_name}`
    );
    console.log(`  ${item.headline}`);
    console.log(`  why: ${item.reason}`);
    console.log(`  do:  ${item.suggested_action}`);
    console.log();
  }
  console.log(`\nModel: ${briefing.model}`);
  console.log(`Jobs considered: ${briefing.jobs_considered}`);
  console.log(`Saved as briefing id: ${briefing.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add `dotenv` and `tsx` for the script**

```bash
npm install --save-dev dotenv tsx
```

- [ ] **Step 3: Add an npm script**

In `package.json`, add to `"scripts"`:

```json
"briefing:test": "tsx scripts/test-briefing.ts"
```

- [ ] **Step 4: Run the smoke test**

```bash
npm run briefing:test
```

Expected: prints summary + 0–10 items. A row appears in Supabase `briefings` with `source = 'manual'`.

If items look wrong (vague, fabricated, missing real-data citations), iterate the `SYSTEM_PROMPT` in `features/briefing/lib/prompt.ts` and rerun. **Do not ship until at least 3 successive runs feel right.**

- [ ] **Step 5: Commit**

```bash
git add scripts/test-briefing.ts package.json package-lock.json
git commit -m "feat(briefing): add local smoke-test script"
```

---

## Task 6: Build the cron API route

**Files:**
- Create: `src/app/api/cron/daily-briefing/route.ts`

- [ ] **Step 1: Write the route handler**

Create `src/app/api/cron/daily-briefing/route.ts`:

```ts
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
```

- [ ] **Step 2: Verify locally**

In one terminal: `npm run dev`
In another:

```bash
curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/daily-briefing
```

Expected: HTTP 200, JSON `{ ok: true, id: "...", items: N, jobs_considered: M }`.

Then: `curl -i http://localhost:3000/api/cron/daily-briefing` → expect 401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/daily-briefing/route.ts
git commit -m "feat(briefing): add cron route handler"
```

---

## Task 7: Build the manual regenerate route

**Files:**
- Create: `src/app/api/briefing/regenerate/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { generateBriefing } from "@features/briefing/lib/generateBriefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  // Single-user app, anon CRUD elsewhere — no extra auth here for now.
  // Tighten later when multi-role auth lands.
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
```

- [ ] **Step 2: Verify locally**

With `npm run dev` running:

```bash
curl -i -X POST http://localhost:3000/api/briefing/regenerate
```

Expected: 200 + `{ ok: true, id: "...", items: N }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/briefing/regenerate/route.ts
git commit -m "feat(briefing): add manual regenerate route"
```

---

## Task 8: Configure the Vercel cron

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-briefing",
      "schedule": "0 16 * * *"
    }
  ]
}
```

`0 16 * * *` = 16:00 UTC every day = **9:00 AM PDT** during daylight savings (May–Nov), 8:00 AM PST in winter. Andrew can adjust to `0 17 * * *` in November if he wants 9am PST year-round.

Vercel cron auth: Vercel auto-injects an `Authorization: Bearer <CRON_SECRET>` header on cron-triggered requests when `CRON_SECRET` is set in env. Our route already validates that.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(briefing): schedule daily-briefing cron at 16:00 UTC"
```

---

## Task 9: Build the briefing page

**Files:**
- Create: `src/app/briefing/page.tsx`
- Create: `features/briefing/components/BriefingFull.tsx`
- Create: `features/briefing/components/BriefingItemCard.tsx`
- Create: `features/briefing/components/RegenerateButton.tsx`

- [ ] **Step 1: Write `features/briefing/components/BriefingItemCard.tsx`**

```tsx
import type { BriefingItem } from "@features/briefing/lib/types";
import Link from "next/link";
import { cn } from "@shared/lib/utils";

const SEVERITY_STYLES = {
  red: "border-status-blocked bg-status-blocked-soft",
  yellow: "border-status-at-risk bg-status-at-risk-soft",
  green: "border-status-on-track bg-status-on-track-soft",
} as const;

const SEVERITY_LABEL = {
  red: "Action today",
  yellow: "Watch",
  green: "Heads up",
} as const;

export function BriefingItemCard({ item }: { item: BriefingItem }) {
  return (
    <Link
      href={`/jobs/${item.job_id}`}
      className={cn(
        "block rounded-lg border-l-4 border border-border bg-surface px-4 py-3 hover:bg-surface-muted transition-colors duration-fast",
        SEVERITY_STYLES[item.severity]
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-text-primary">
          {item.headline}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary shrink-0">
          {SEVERITY_LABEL[item.severity]}
        </div>
      </div>
      <div className="mt-1 text-xs text-text-secondary">
        <span className="font-mono">{item.job_code}</span>
        <span className="mx-1.5 text-text-tertiary">·</span>
        <span>{item.job_name}</span>
        <span className="mx-1.5 text-text-tertiary">·</span>
        <span>{item.client}</span>
      </div>
      <div className="mt-2 text-sm text-text-secondary leading-relaxed">
        {item.reason}
      </div>
      <div className="mt-2 text-sm text-text-primary">
        <span className="text-text-tertiary text-xs uppercase tracking-wider mr-2">
          Do:
        </span>
        {item.suggested_action}
      </div>
    </Link>
  );
}
```

NOTE: if `status-blocked-soft` etc. tokens don't exist in the project, fall back to inline styles using existing tokens. Run `grep -r "status-blocked" tailwind.config.ts` to verify before writing the component. If they don't exist, use:

```ts
const SEVERITY_STYLES = {
  red: "border-l-red-500 bg-red-50",
  yellow: "border-l-amber-500 bg-amber-50",
  green: "border-l-emerald-500 bg-emerald-50",
} as const;
```

- [ ] **Step 2: Write `features/briefing/components/RegenerateButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function RegenerateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/briefing/regenerate", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-status-blocked">{error}</span>}
      <button
        onClick={regenerate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface text-text-primary px-3 py-1.5 text-sm font-medium hover:bg-surface-muted transition-colors duration-fast disabled:opacity-50"
      >
        <RefreshCw
          className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
          strokeWidth={2}
        />
        {busy ? "Generating…" : "Regenerate"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `features/briefing/components/BriefingFull.tsx`**

```tsx
import type { Briefing } from "@features/briefing/lib/types";
import { BriefingItemCard } from "./BriefingItemCard";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BriefingFull({ briefing }: { briefing: Briefing }) {
  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
          Summary · {formatTime(briefing.generated_at)}
        </div>
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-line">
          {briefing.summary}
        </p>
        <div className="mt-3 text-xs text-text-tertiary">
          {briefing.jobs_considered} open jobs considered · {briefing.model} ·
          source: {briefing.source}
        </div>
      </div>

      {briefing.items.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-text-secondary">
          Nothing flagged today. Quiet shop.
        </div>
      ) : (
        <div className="space-y-2">
          {briefing.items.map((item, i) => (
            <BriefingItemCard key={`${item.job_id}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/app/briefing/page.tsx`**

```tsx
import { getLatestBriefing } from "@features/briefing/lib/generateBriefing";
import { BriefingFull } from "@features/briefing/components/BriefingFull";
import { RegenerateButton } from "@features/briefing/components/RegenerateButton";
import { PageHeader } from "@shared/components/layout/PageHeader";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const briefing = await getLatestBriefing();

  return (
    <>
      <PageHeader
        eyebrow="Daily"
        title="Briefing"
        subtitle={
          briefing
            ? `${briefing.items.length} item${
                briefing.items.length === 1 ? "" : "s"
              } need attention today`
            : "No briefings generated yet"
        }
        actions={<RegenerateButton />}
      />
      <div className="px-8 py-6">
        {briefing ? (
          <BriefingFull briefing={briefing} />
        ) : (
          <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-text-secondary">
            No briefing yet. Click Regenerate to produce one now, or wait until
            tomorrow's 9am cron.
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Run dev and verify**

```bash
npm run dev
```

Open http://localhost:3000/briefing in browser. Should render the latest briefing (the row created by the smoke test in Task 5). Click "Regenerate" → busy state → page refreshes with new content. Each item card should be clickable and route to `/jobs/<id>`.

- [ ] **Step 6: Commit**

```bash
git add src/app/briefing features/briefing/components
git commit -m "feat(briefing): add /briefing page with regenerate button"
```

---

## Task 10: Add briefing to sidebar nav

**Files:**
- Modify: `shared/components/layout/Sidebar.tsx:34-66`

- [ ] **Step 1: Add Briefing link at the top**

Edit `shared/components/layout/Sidebar.tsx`. The current `NAV` array starts:

```ts
const NAV: NavSection[] = [
  {
    items: [{ href: "/", label: "Pipeline", icon: LayoutGrid }],
  },
```

Replace the first section with:

```ts
const NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "Pipeline", icon: LayoutGrid },
      { href: "/briefing", label: "Briefing", icon: Sparkles },
    ],
  },
```

And add `Sparkles` to the lucide imports at the top (line 5–19): change `LayoutGrid,` line block to include `Sparkles,`.

- [ ] **Step 2: Verify nav highlights correctly**

Run `npm run dev`. Click "Briefing" — link should be active when on `/briefing`. Click "Pipeline" — should be active on `/` and `/jobs/...` (existing logic at line 100-103 handles this).

- [ ] **Step 3: Commit**

```bash
git add shared/components/layout/Sidebar.tsx
git commit -m "feat(briefing): add /briefing to sidebar nav"
```

---

## Task 11: Add briefing card to homepage

**Files:**
- Create: `features/briefing/components/BriefingCard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write `features/briefing/components/BriefingCard.tsx`**

A compact card that fetches the latest briefing client-side, shows summary + top 3 items, and links to `/briefing`.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import type { Briefing, BriefingRow } from "@features/briefing/lib/types";
import { cn } from "@shared/lib/utils";

const SEVERITY_DOT = {
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
} as const;

export function BriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!hasSupabase()) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from("briefings")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setBriefing((data as BriefingRow | null) ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  if (!briefing) return null;

  const top = briefing.items.slice(0, 3);

  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4 mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-tertiary">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Today's briefing
        </div>
        <Link
          href="/briefing"
          className="text-xs text-accent hover:text-accent-hover inline-flex items-center gap-1"
        >
          Open <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <p className="text-sm text-text-primary mb-3 leading-relaxed">
        {briefing.summary}
      </p>
      {top.length > 0 && (
        <ul className="space-y-1.5">
          {top.map((item, i) => (
            <li
              key={`${item.job_id}-${i}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[item.severity])}
              />
              <Link
                href={`/jobs/${item.job_id}`}
                className="text-text-primary hover:underline"
              >
                {item.headline}
              </Link>
              <span className="text-text-tertiary text-xs ml-auto">
                {item.job_code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Insert into `src/app/page.tsx`**

Edit `src/app/page.tsx`. Add the import:

```tsx
import { BriefingCard } from "@features/briefing/components/BriefingCard";
```

Add `<BriefingCard />` inside the page wrapper, just above the existing `<div className="px-8 py-6">`. Specifically, replace:

```tsx
      />
      <div className="px-8 py-6">
        {loading ? (
```

with:

```tsx
      />
      <div className="px-8 pt-5">
        <BriefingCard />
      </div>
      <div className="px-8 py-6 pt-1">
        {loading ? (
```

- [ ] **Step 3: Verify**

`npm run dev`. Open http://localhost:3000. Above the pipeline list/Kanban, briefing card should appear with summary + up to 3 items. Each item links to its job. "Open" link goes to `/briefing`.

- [ ] **Step 4: Commit**

```bash
git add features/briefing/components/BriefingCard.tsx src/app/page.tsx
git commit -m "feat(briefing): add briefing card to pipeline home"
```

---

## Task 12: Write the feature spec

**Files:**
- Create: `features/briefing/CLAUDE.md`

- [ ] **Step 1: Write the spec**

Mirror the style of `features/jobs/CLAUDE.md`. Create `features/briefing/CLAUDE.md`:

```markdown
# Briefing

AI-generated daily intelligence for the cabinet shop. One row per generation
in `briefings` Supabase table; the page renders the latest one.

## What it does

- `/briefing` — full page: summary, items, regenerate button.
- Briefing card on `/` — top 3 items + "Open" link.
- `GET /api/cron/daily-briefing` — Vercel cron at 16:00 UTC (9am PDT).
  Auth via `CRON_SECRET` Bearer header that Vercel auto-injects.
- `POST /api/briefing/regenerate` — manual trigger from the page.

## Where things live

​```
features/briefing/
├── components/
│   ├── BriefingCard.tsx       (homepage widget)
│   ├── BriefingFull.tsx       (/briefing page renderer)
│   ├── BriefingItemCard.tsx   (one item)
│   └── RegenerateButton.tsx   (POSTs to regenerate route)
└── lib/
    ├── generateBriefing.ts    (the agent: jobs → Anthropic → Supabase)
    ├── prompt.ts              (SYSTEM_PROMPT, BRIEFING_TOOL, jobsToInput)
    ├── serverSupabase.ts      (service-role client; server-only)
    └── types.ts               (Briefing, BriefingItem, BriefingRow)
```

## Domain notes

- **One agent, one tool call.** We use Anthropic `tool_use` with
  `tool_choice` forced to `submit_briefing` so we always get
  structured JSON back. No prose-parsing.
- **Severity**: `red` = action today, `yellow` = watch, `green` =
  informational. The prompt tells the model to *skip* healthy jobs,
  not list them as filler.
- **Service role** is required for inserts because the table's RLS
  is anon-read-only. Reads (homepage card) use the public anon
  client because RLS allows it.
- **Cron auth**: Vercel automatically sets
  `Authorization: Bearer ${CRON_SECRET}` when triggering crons. Our
  route checks that exact header. Don't change CRON_SECRET in only
  one place.
- **Time zone**: cron is `0 16 * * *` UTC = 9am PDT. Switch to `0 17`
  in November for 9am PST, or just live with 8am PST.

## When to revisit

- **Split into 3 agents** (bookkeeper / workhorse / intelligence) —
  do this when the single prompt starts producing flaky output or
  hits context limits. Track regression rate first; don't split
  preemptively (Alyssa's lesson: monoliths are fine until they
  aren't).
- **Connector intake**: forwarding emails into briefing context
  (Gmail MCP / Resend inbound). Adds the Fireflies-equivalent layer.
- **Multi-recipient**: email digest via Resend or Gmail MCP. Send to
  installer + Andrew; the page is fine for now while he's solo.
- **Briefing history**: `/briefing/history` listing past N days for
  trend reading. Easy follow-up — the table already keeps history.
- **Auth on regenerate route**: currently open like the rest of the
  app's anon-CRUD pattern. Tighten when multi-role auth lands.
```

- [ ] **Step 2: Commit**

```bash
git add features/briefing/CLAUDE.md
git commit -m "docs(briefing): add feature spec"
```

---

## Task 13: Build, deploy, verify in production

**Files:** none (deployment only)

- [ ] **Step 1: Full local build**

```bash
npm run build
```

Expected: build succeeds, no type errors. If the `briefing` route appears in the route summary, success.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Watch the Vercel deploy**

```bash
vercel
```

Or open https://vercel.com/dashboard and watch the deployment for the latest commit. Wait for "Ready".

- [ ] **Step 4: Verify production briefing page**

Open https://good-woods-dashboard.vercel.app/briefing in browser.

Expected: page loads, shows the briefing from the smoke test (or empty state if the prod Supabase is a different project — check carefully).

If the Supabase project is the same in prod, the briefing row from Task 5 is already there.

- [ ] **Step 5: Manually trigger the cron from prod**

```bash
curl -i -H "Authorization: Bearer YOUR_PROD_CRON_SECRET" https://good-woods-dashboard.vercel.app/api/cron/daily-briefing
```

Expected: 200 + `{ ok: true, ... }`. Confirm a new row in Supabase with `source = 'cron'`.

- [ ] **Step 6: Verify cron is registered**

In the Vercel dashboard → Project → Settings → Cron Jobs. Should list `/api/cron/daily-briefing` with schedule `0 16 * * *`. Note: Vercel Hobby plan limits cron to once-daily, which fits this exactly. If the project is on Hobby and the cron doesn't appear, upgrade visibility (no upgrade is required for daily crons on Hobby as of 2026).

- [ ] **Step 7: Update project memory**

Update `C:\Users\andre\.claude\projects\C--Users-andre\memory\project_good_woods_dashboard.md` to note that the daily briefing module shipped, including:
- briefings table in Supabase
- 9am PDT cron
- ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET in env
- `features/briefing/` follows the established feature-folder pattern

- [ ] **Step 8: Final commit**

If any docs / memory files changed:

```bash
git add -A
git commit -m "docs(briefing): note daily briefing shipped in project memory"
git push origin main
```

---

## Self-Review

**Spec coverage:** All bullets from the recommendation are covered: schema, cron handler, agent prompt, briefing page, homepage card, sidebar link, deploy verification, memory update.

**Placeholder scan:** No "TBD"s, no "implement later"s, no "similar to Task N"s. Each step has the actual code or command. Severity color tokens have a fallback path called out in Task 9 Step 1.

**Type consistency:** `BriefingItem` and `BriefingRow` referenced consistently across Tasks 3, 4, 9, 11. `generateBriefing` signature matches between Task 4 (definition) and Tasks 6, 7 (callers). `getLatestBriefing` defined in Task 4, used in Task 9. `BRIEFING_MODEL` defined in Task 3, used in Task 4.

**Risks worth flagging:**
- The `status-*-soft` Tailwind tokens may not exist — Task 9 Step 1 has a fallback path with raw red/amber/emerald.
- Vercel Hobby plan caps cron frequency. Daily crons are allowed; verify in dashboard after deploy.
- The smoke test in Task 5 will charge a small amount on the Anthropic API key. Iterating on the prompt = repeat charges. Cap the expected cost at a few cents for typical job counts (<100 open jobs).
