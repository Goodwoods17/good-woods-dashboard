# Claude Code Playbook — Good Woods Dashboard

How this project uses Claude Code, what's new on the platform that
matters here, and what to add next. Refreshed in place — not appended
— when the platform shifts.

Last refresh 2026-05-28 (tooling pass — see the dated note at the
bottom). ADRs in `docs/decisions/` remain the source of truth for
project-shape decisions; this file is the source of truth for *how we
drive Claude Code against the project*.

---

## TL;DR — One next action

**The error-reducing setup is complete — start building.** Tooling,
verification, docs, and deploy visibility are all wired (see Done below).

The only thing left is a 30-second cleanup: disable the dead-weight
global plugins (`deep-research` broken, `imessage` macOS, `pyright-lsp`
no Python, `bio-research`) in `~/.claude/settings.json` to trim context.
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
   `features/<name>/CLAUDE.md` and is canonical. **Modernized
   2026-05-28** for the Next.js/TS/Supabase reality — `/feature`
   scaffolds `features/<name>/{components,lib}` TSX + a thin route
   page (not the old `.html/.css/.js` + `index.html`), and project-wide
   rules now live in a **root `CLAUDE.md`** that all commands reference.
2. **Auto mode is on globally** (`defaultMode: auto`,
   `skipAutoPermissionPrompt: true`). Anthropic now restricts auto
   mode to Sonnet 4.6 / Opus 4.6 / Opus 4.7 and **excludes Pro plans
   entirely**; Max plans get auto only on Opus 4.7. Verify Andrew's
   plan covers what we assume.
   ([source](https://code.claude.com/docs/en/permission-modes))
3. **Per-feature CLAUDE.md specs.** Canonical pattern. Don't replace
   specs with auto-memory chatter.
4. **Verification gate before merge.** `/verify` now runs the **real
   toolchain** — `npx tsc --noEmit` + `npm run lint` + Prettier (and
   `npm run build` on risky changes) — and auto-fixes what they flag,
   instead of mentally tracing logic. A `PostToolUse` hook
   (`.claude/hooks/format-on-edit.mjs`) also auto-formats every edited
   file. **`/ultrareview`** (shipped with Opus 4.7 on 2026-04-16) is the
   heavyweight cloud version — use only on merges to `main` that touch
   DB, auth, or money. Billed separately per run; not a default.
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
- **Editor agent** defaults to **Opus 4.8** (launched 2026-05-28; set
  as Andrew's default model the same day). Same pricing as 4.7 with
  built-in effort control. Sonnet 4.6 stays the speed choice for
  general coding.
- **Subagents:** Sonnet 4.6 for sub-tasks, Opus 4.8 for orchestration
  / synthesis. Refresh runs of this playbook used four parallel
  general-purpose agents — works fine.
- **Effort control** (4.8 built-in; `/effort` slider since v2.1.111)
  dials Opus reasoning up to "xhigh" for tricky RLS / Server Actions,
  down for boilerplate — no model rotation needed.

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
SketchUp, Claude in Chrome, Supabase, Context7, Vercel.

**MCP servers plugin-installed but unused:** ~25 others from plugin
defaults that aren't needed (see dead-plugin cleanup below).

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

## Done (closed 2026-05-09 → 2026-05-28)

- ✅ **Supabase MCP** — connected 2026-05-10, scoped to this project.
- ✅ **typescript-lsp** installed (`claude-plugins-official`) — real
  type-checking + go-to-definition instead of grep loops.
- ✅ **`PostToolUse` Prettier hook** — `.claude/hooks/format-on-edit.mjs`
  auto-formats every edited file. Style nits gone.
- ✅ **Root `CLAUDE.md`** — project-wide stack/conventions/toolchain in
  one canonical file; documents the **Monitor** rule (run `npm run dev`
  / `vercel logs --follow` via Monitor so errors land live).
- ✅ **Toolchain allowlist** — `tsc`, `next`, `npm run dev/build/lint`,
  `eslint`, `supabase`, `tsx` no longer prompt (the manual half of what
  `/fewer-permission-prompts` would have proposed).
- ✅ **`/verify` runs the real toolchain** (see workflow §4).
- ✅ **Context7 MCP** — added 2026-05-28, user-scoped HTTP server
  (`https://mcp.context7.com/mcp`), connected. Pulls live, version-pinned
  Next.js / Supabase / shadcn docs into the prompt to kill App Router
  API drift. Free tier; if rate limits bite, add a `CONTEXT7_API_KEY`
  header via `claude mcp remove`/`add`.
- ✅ **Vercel MCP** — authenticated 2026-05-28 (OAuth). Claude can read
  deploy status, build/runtime logs, env, and projects directly
  (team `goodwoods17's projects`, project `good-woods-dashboard`).

## Still open (ranked, ADHD rule: max 7)

1. **Disable dead-weight global plugins** — `deep-research` (broken),
   `imessage` (macOS), `pyright-lsp` (no Python), `bio-research`. Trims
   context; flip the flags in `~/.claude/settings.json`.

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

Last refreshed 2026-05-28 (tooling pass — modernized the seven slash
commands for the Next.js/TS/Supabase reality, added the root `CLAUDE.md`,
the Prettier `PostToolUse` hook, the toolchain allowlist, and the
`/verify` real-toolchain gate; installed `typescript-lsp` and the
Context7 MCP; switched the editor default to Opus 4.8). Prior pass
2026-05-09 (`/last30days` +
Anthropic-official + ecosystem agents in parallel).
