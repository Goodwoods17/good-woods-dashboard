# 0005. Notion not integrated into the dashboard

Date: 2026-05-08

## Status
Accepted — defers Notion integration. Revisit conditions are listed
at the bottom; until one fires, treat this as the canonical answer.

## Context

The dashboard runs on Supabase Postgres (jobs, briefings, with RLS) +
localStorage fallback (catalog, shop, inventory). It's a single-user
app for now, with installer / bookkeeper / designer collaborators
likely later. M1–M7 are live and the AI Daily Briefing feature is
queued to ship next.

The question raised: should Notion be integrated as part of the
ongoing build-out — embedded pages, two-way sync, or as a content
layer behind dashboard surfaces?

Andrew may already keep client notes, finish samples, vendor specs,
or design briefs in Notion today. The pull is real: Notion is genuinely
good at rich-text content, and the dashboard would otherwise need to
build that surface itself for SOPs, design briefs, and vendor specs.

## Decision

**Do not integrate Notion now.** Operational data — jobs, costs,
milestones, P&L, briefings — stays in Supabase permanently. Knowledge
or content data stays out of the dashboard for now; if it lives
anywhere, it lives in Notion as an external link, not an integration.

If a real need emerges later, the integration is scoped to:

- **One narrow domain** (most likely design briefs or vendor specs).
- **Read-only.** Server-side fetched, runtime-cached 10 minutes,
  rendered into the dashboard. No two-way sync.
- **Its own feature folder** (`features/notion/`) with a CLAUDE.md
  that names Notion as canonical for that domain only.
- **Off the cron path.** The briefing engine and any other automated
  work never depend on a Notion API call.

## Reasoning

**Cost of integrating now:**

- Adds a third data layer behind the existing two (Supabase +
  localStorage). More boundaries to maintain than features to add.
- Notion API latency (300–800ms typical) breaks the dashboard's
  "fast, terse" character unless aggressively cached.
- Two sources of truth invite drift. Once a job has both a Supabase
  row and a Notion page, reconciliation work appears.
- Notion API has shipped breaking changes; rate limits (3 req/sec)
  throttle automated paths.
- Permission model is per-page/per-database, not per-role —
  doesn't compose with the role-based auth the dashboard will
  eventually need.
- Per-seat pricing once installer + bookkeeper join.

**What it would buy now:**

- Reuse of content Andrew may already keep in Notion (avoiding
  double-entry).
- Free CMS-style surface for SOPs, design briefs, vendor specs —
  saves building rich-text editing in the dashboard.

**Why the cost wins today:**

- The dashboard is ahead of schedule. The next visible win is the
  briefing feature, not a content layer.
- Andrew is solo. There is no second user whose onboarding needs
  Notion to be solved.
- A `Workspace → Handbook` link that opens notion.so directly costs
  nothing and captures most of the value of "Notion is part of the
  build-out" without coupling.

## Alternatives considered

- **Two-way sync (jobs ↔ Notion database).** Rejected. Sync drift,
  schema fragility, and rate-limit risk on automated paths. Operational
  data must not pass through Notion.
- **Embed Notion pages as iframes.** Rejected for now. Acceptable
  fallback if a content domain materialises, but iframes degrade
  badly on mobile and break offline. Server-side fetch + cache is
  preferred when the time comes.
- **Use Notion as the SOPs backend.** Rejected. SOPs already shipped
  (M4) using markdown in `features/sops/sops.ts`. Migrating now would
  trade working code for a slower, less-typed alternative.
- **Build a richer content surface in-house.** Deferred. Not needed
  yet; revisit only if a content domain (design briefs, vendor specs)
  becomes a daily friction point.

## Conflict-resolution rule

When UX speed and Notion integration conflict — and they will, because
Notion is slow — **UX speed wins**. The dashboard's character is
"fast, terse, owner-to-owner." Sub-second page loads matter more than
content reuse. If a future Notion-backed page can't render under
1 second on a warm cache, it doesn't ship.

## Consequences

**Positive:**

- No new auth surface, no new rate-limit ceiling, no new vendor
  dependency.
- Briefing feature and any future cron work stay on Supabase data,
  fast and predictable.
- Future role-based auth can be designed against Supabase RLS only,
  not split across two permission models.

**Negative:**

- If Andrew already maintains design briefs or vendor specs in
  Notion, double-entry continues for now.
- A future SOP-editing experience for non-technical collaborators
  (installer leaving notes, designer revising briefs) will need to
  be built in-house when it's needed.

## Revisit when

- Installer or designer collaborators are actually onboarded and
  need to edit content (SOPs, design notes, vendor specs) without
  touching code or the dashboard form layer.
- Andrew finds himself maintaining the same content in Notion AND
  the dashboard for more than two weeks running.
- A specific content domain (most likely design briefs or vendor
  specs) becomes a daily friction point that text fields in the
  dashboard can't absorb.
- Any of the above: scope the integration per the **Decision**
  section — one domain, read-only, cached, its own feature folder.

## Cross-references

- ADR 0004 — Next.js + Supabase as canonical stack. Notion would be
  an addition to that stack, not a replacement of any layer.
- `features/sops/CLAUDE.md` — current SOPs implementation; the
  closest existing feature to anything Notion would replace.
