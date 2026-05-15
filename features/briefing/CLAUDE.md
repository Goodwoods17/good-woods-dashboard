# Briefing

AI-generated daily intelligence for the cabinet shop. One row per generation
in the `briefings` Supabase table; the page renders the latest one.

## What it does

- `/briefing` — full page: summary, items, regenerate button.
- Briefing card on `/` — top 3 items + "Open" link.
- `GET /api/cron/daily-briefing` — Vercel cron at 16:00 UTC (9am PDT).
  Auth via `CRON_SECRET` Bearer header that Vercel auto-injects.
- `POST /api/briefing/regenerate` — manual trigger from the page.

## Where things live

```
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
  preemptively (one of Alyssa Paxevanos-Evans' lessons from her
  CRM build: monoliths are fine until they aren't).
- **Connector intake**: forwarding emails into briefing context
  (Gmail MCP / Resend inbound). Adds the Fireflies-equivalent layer.
- **Multi-recipient**: email digest via Resend or Gmail MCP. Send to
  installer + Andrew; the page is fine for now while he's solo.
- **Briefing history**: `/briefing/history` listing past N days for
  trend reading. Easy follow-up — the table already keeps history.
- **Auth on regenerate route**: currently open like the rest of the
  app's anon-CRUD pattern. Tighten when multi-role auth lands.
