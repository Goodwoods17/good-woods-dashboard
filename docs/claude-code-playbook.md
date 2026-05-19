# Claude Code Playbook — Good Woods Dashboard

How this project uses Claude Code, what's new on the platform that
matters here, and what to add next. Refreshed in place — not appended
— when the platform shifts.

Last refresh (2026-05-09, second pass) used four parallel research
streams: `/last30days "claude code"`, `/last30days "claude code skills"`,
an Anthropic-official deltas pass, and a local-inventory + ecosystem
pass. ADRs in `docs/decisions/` remain the source of truth for
project-shape decisions; this file is the source of truth for *how we
drive Claude Code against the project*.

---

## TL;DR — One next action

**Connect the Supabase MCP server, then install `supabase/agent-skills`
in the same sitting.** ~45 minutes total, payoff visible in under a week.

1. claude.ai → Settings → Connectors → Supabase → authorise the dev
   project (`zycdmlkffbaqofaygddx`) in **read-only mode** first.
2. Same session: `claude skill add supabase/agent-skills`.
   ([source](https://supabase.com/blog/supabase-agent-skills))
3. Next prompt: *"Generate RLS policies that lock `jobs` to authenticated
   users only, then apply them."*

Why this one:
- Directly unblocks the top item in `.remember/remember.md` (RLS
  tightening before real client data lands).
- Replaces the loop of pasting SQL into the Supabase web editor +
  running `notify pgrst, 'reload schema'` by hand.
- The skill teaches Claude correct RLS / pooling / `service_role`
  patterns; the MCP gives it hands. First real-world test of the
  "skills + MCP" pairing on this stack.

While you're in there, **fix the broken `deep-research` plugin install**
— it's listed as enabled but never actually cloned. 30 seconds. See
the inventory section.

Everything else in this doc is optional.

---

## The workflow we use

Validated against Anthropic's
[best practices](https://code.claude.com/docs/en/best-practices) and
[memory guide](https://code.claude.com/docs/en/memory).

1. **Plan-feature → feature → work → verify → checkpoint.** Seven
   slash commands in `.claude/commands/` (`plan-feature`, `feature`,
   `work`, `verify`, `checkpoint`, `decision`, `explain`) cover
   Anthropic's explore → plan → execute → verify → commit cycle.
   `/plan-feature` runs first for anything new; the spec lands in
   `features/<name>/CLAUDE.md` and is canonical.
2. **Auto mode is on globally** (`defaultMode: auto`,
   `skipAutoPermissionPrompt: true`). Anthropic now restricts auto
   mode to Sonnet 4.6 / Opus 4.6 / Opus 4.7 and **excludes Pro plans
   entirely**; Max plans get auto only on Opus 4.7. Verify Andrew's
   plan covers what we assume.
   ([source](https://code.claude.com/docs/en/permission-modes))
3. **Per-feature CLAUDE.md specs.** Canonical pattern. Don't replace
   specs with auto-memory chatter.
4. **Verification gate before merge.** `/verify` runs the multi-phase
   self-check on every change. **`/ultrareview`** (shipped with Opus
   4.7 on 2026-04-16) is the heavyweight cloud version — use only on
   merges to `main` that touch DB, auth, or money. Billed separately
   per run; not a default.
   ([Opus 4.7 launch](https://www.anthropic.com/news/claude-opus-4-7))
5. **Checkpoints.** Pre-edit checkpoints shipped May 2026; `Esc Esc`
   or `/rewind` restores code/conversation. Use this instead of
   fearful committing.
6. **`/btw` for sidebar questions.** Answers in a dismissible overlay,
   never enters main session context. Cheap habit, big payoff on long
   sessions.

## Model selection on this project

- **Briefing feature** (`features/briefing/lib/prompt.ts`) uses
  `claude-sonnet-4-6` via the Anthropic SDK. Don't refactor to "4-5".
- **Editor agent** defaults to **Opus 4.7** (launched 2026-04-16) on
  Enterprise pay-as-you-go. Sonnet 4.6 stays the speed choice for
  general coding.
- **Subagents:** Sonnet 4.6 for sub-tasks, Opus 4.7 for orchestration
  / synthesis. Both refresh runs of this playbook used four parallel
  general-purpose agents — works fine.
- **`/effort` slider** (v2.1.111) dials Opus 4.7 reasoning up to
  "xhigh" for tricky RLS / Server Actions, down for boilerplate —
  no model rotation needed.

---

## What's new in the last 60 days that matters here

Filtered ruthlessly. Skipped: Bedrock/Vertex tiers, Voice mode, Agent
Teams (experimental, "uses significantly more tokens"), Dispatch
(laptop-must-be-awake), `/buddy` (April Fools).

| Feature | Date | Why it matters here |
|---|---|---|
| **Opus 4.7** + `/ultrareview` | 2026-04-16 | New default editor model; /ultrareview = drop-in heavyweight /verify upgrade. ([news](https://www.anthropic.com/news/claude-opus-4-7)) |
| **Win11: PowerShell auto-approved** + Git Bash no longer required | v2.1.119–120 | Removes Win11's biggest friction. Native shell tool just works. |
| **Plugin marketplace + `--plugin-url` / `.zip` installs** | v2.1.108–129 | Pin a known-good plugin URL per project. |
| **`/usage`** (replaces `/cost` + `/stats`) | v2.1.118 | Single number for what's burning your limits. |
| **`/effort` slider** | v2.1.111 | Per-task reasoning dial without rotating models. |
| **`claude project purge`** | v2.1.126 | Wipes transcripts/tasks/file history when changing direction. |
| **PreCompact hook + recap + `/resume` PR URL search** | v2.1.105–122 | Long sessions survive compaction with intent intact. |
| **Auto mode classifier** | 2026-03-25 | Already on. Pro plans now excluded — verify your tier. |
| **Subagents** GA + parallel dispatch | 2026-05 | Used for both refresh passes of this playbook. |
| **Checkpoints** (`Esc Esc` / `/rewind`) | 2026-05 | Replaces "should I commit before letting Claude refactor". |
| **Monitor tool** (live stdout streaming) | 2026-04-09, v2.1.98 | Tail `next dev` / `vercel logs --follow` / `supabase db push` live. |
| **Routines + API + GitHub triggers** (`/fire` endpoint) | 2026-04 | Future "PR-opened → review routine" without GitHub Actions. |
| **MCP Tool Search lazy-loading** | GA, default-on | Why our multi-MCP session doesn't bloat context. |
| **Auto Memory** as first-class feature | 2026-04 | Listed alongside CLAUDE.md in docs. Leave at user scope only. |
| **Code w/ Claude rate-limit doubling** | 2026-05-06 | Pro/Max get 2× per 5h window. ([source](https://www.anthropic.com/news/higher-limits-spacex)) |

Source roll-up:
[official changelog](https://code.claude.com/docs/en/changelog),
[releases](https://github.com/anthropics/claude-code/releases),
[supabase agent skills](https://supabase.com/blog/supabase-agent-skills),
[simon willison Code w/ Claude](https://simonwillison.net/2026/May/6/code-w-claude-2026/).

---

## What we already have installed

Inventoried 2026-05-09 (refresh). Marketplaces and plugins live in
`~/.claude/settings.json`.

**Plugins active and useful here:** `vercel`, `superpowers`,
`frontend-design`, `claude-api`, `claude-md-management`,
`pr-review-toolkit`, `code-review`, `playground`, `claude-code-setup`,
`pdf-viewer`, `example-skills`, `document-skills`, `last30days` ✅.

**Plugins enabled but BROKEN install:** `deep-research@phyr97-marketplace`.
The marketplace metadata was fetched but the plugin source repo was
never cloned — `enabledPlugins` shows true, but `~/.claude/plugins/cache/`
has no `phyr97` directory and `installed_plugins.json` has zero
`phyr97` entries. Fix in TL;DR cleanup.

**Plugins that are dead weight on Win11 / this project:** `imessage`
(macOS only), `pyright-lsp` (no Python), `bio-research` (not Andrew's
domain). Disable when convenient.

**MCP servers active:** Gmail, Google Calendar, Google Drive, Trimble
SketchUp, Claude in Chrome.

**MCP servers plugin-installed but not authenticated:** Vercel (OAuth
ready), plus ~25 others from plugin defaults that aren't needed.

**Project `.claude/`** has 7 slash commands: `plan-feature`, `feature`,
`work`, `verify`, `checkpoint`, `decision`, `explain`. Permissions
list scoped tightly — `WebFetch`, `rm`, `git push`, `curl`, hard
resets denied; reads/formats/`node`/python http-server allowed.

**Inventory truth-check** (run when in doubt):

```powershell
Get-ChildItem ~/.claude/plugins/cache/<marketplace>/<plugin>
```

Empty result = plugin body isn't actually downloaded; the
`enabledPlugins` flag is a lie. This is how we caught the
`deep-research` drift.

---

## What to add next (ranked, ADHD rule: max 7)

1. **Supabase MCP + `supabase/agent-skills`** — see TL;DR.
2. **Context7** — `/plugin marketplace add upstash/context7`. Pulls
   live, version-pinned Next.js + Supabase + shadcn docs into the
   prompt. Kills "App Router API drift" hallucinations cold.
   ([docs](https://context7.com/docs/clients/claude-code))
3. **typescript-lsp** (Anthropic official) — Real-time type checking
   and go-to-definition; ~50 ms answers vs 30–60 s grep loops.
   `claude plugins add typescript-lsp@claude-plugins-official`.
4. **Complete Vercel MCP OAuth.** Plugin already installed; one click.
   Lets Claude check deploy status, edge config, env without us
   pasting the dashboard URL.
5. **`PostToolUse` Edit/Write → `npx prettier --write` hook.** ~8 lines
   in `.claude/settings.json`. Permission already allowed. Eliminates
   style nits forever.
6. **Document the Monitor tool in project CLAUDE.md.** Single rule:
   *"When iterating on UI or API routes, run `npm run dev` and
   `vercel logs --follow` via Monitor so type/runtime errors land in
   our conversation live."*
7. **Run `/fewer-permission-prompts`** to scan transcripts and propose
   a project-level allowlist for `npm run dev:*`, `next *`,
   `npx supabase:*`. Skill already installed.

Skip until justified by a concrete pain:
- **Routines for the briefing** — finish the in-flight Vercel Cron
  feature first, then evaluate.
- **Agent Teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) — token
  cost too high for solo work; revisit post-rebrand cutover.
- **shadcnblocks-skill** — useful if we add 5+ new dashboard surfaces;
  not for current scope.
- GitHub MCP, Stripe MCP, Linear/Slack MCPs — not part of this stack.
- Postgres MCP — Supabase MCP supersedes.
- Auto Memory at project scope — leave at user scope only.

---

## Conflicts and open questions from research

- **Auto-mode plan eligibility.** Anthropic now states Pro plans get
  no auto mode; Max plans are restricted to Opus 4.7. Verify Andrew's
  plan covers what we assume.
  ([source](https://code.claude.com/docs/en/permission-modes))
- **`/last30days` skill reliability.** Today's run surfaced MCP server
  boilerplate (Chrome, SketchUp) instead of executing its canonical
  pipeline; the agent fell back to manual WebSearch + WebFetch and
  produced fine results. Treat the skill as "WebSearch with good
  prompts" until it stabilises. Watch for an upstream fix.
- **Sonnet 4.5 vs 4.6 naming.** Anthropic copy still mixes
  `claude-sonnet-4-5` and `claude-sonnet-4-6`. Per the active session
  prompt, current canonical IDs are `claude-sonnet-4-6` and
  `claude-opus-4-7`. Use those.
- **Routines vs Vercel Cron for the briefing.** Routines now expose
  HTTP `/fire` and GitHub `pull_request` / `release` triggers — a
  bigger story than the prior "cron only" framing. Still defer the
  call: finish Vercel Cron first, then decide if migration earns
  its weight.
- **Engineering post 2026-04-23 "An update on recent Claude Code
  quality reports"** is listed on the engineering index but the URL
  404s. Worth a manual check next session — Anthropic's own quality
  postmortem may flag context-rot patterns we should preempt.
- **Context-rot is the new perf villain.** Consensus across Reddit/HN
  in late April: ≤3 active skills per session, each <2–3k tokens.
  Today's `enabledPlugins` list is comfortably under that — stay
  disciplined when adding more.
- **`claude-mem` skill.** Open security flag (port 37777, Feb 2026).
  Don't install until closed.
- **Auto Memory pollution risk.** Reviewers report occasional incorrect
  "facts" propagating forward. Solution: leave at user scope only,
  audit `MEMORY.md` weekly when reviewing the cabinet-business memory
  anyway.

---

## How to use this document

- Read before adopting a new Claude Code feature on this project —
  most have already been considered.
- When platform changes shift our workflow, update the relevant
  section in place (don't append "Update 2026-XX" blocks; rewrite
  so the doc stays under 250 lines).
- Cross-reference from README workflow section as needed.

Last refreshed 2026-05-09 (second pass — `/last30days` + Anthropic-
official + ecosystem agents in parallel; `/deep-research` plugin not
yet operational, see TL;DR cleanup item).
