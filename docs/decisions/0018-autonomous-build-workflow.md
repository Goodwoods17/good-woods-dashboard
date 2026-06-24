# 18. Autonomous build workflow: plan-everything-first, then run-till-done on a local agent loop

Date: 2026-06-24
Status: Accepted

## Context

The build loop to date is **one long interactive session**: Andrew and the agent
plan, code, and test in the same context, in focused bursts, with Andrew driving
each step and running the interactive browser check by hand at the end of every
slice. Two problems with that for how Andrew actually works:

1. **The context wall.** A large feature overflows a single session's context.
   When it does, the work has to continue in a *new* session — and Andrew often
   works remotely from his phone via Remote Control, where he **cannot spawn a new
   terminal session**. The build stalls until he's back at the laptop.
2. **He's in the loop for the boring parts.** "Test along the way so the buttons
   and clicks work" currently means *Andrew* clicking around. That's the manual
   step he wants to delegate.

What he wants: **plan the entire feature up front** (research + grill-with-docs +
a written plan), then **let the agent run to completion** — building, testing, and
landing each slice — while he watches progress from his phone and only gets pulled
in for real decisions.

This reverses a prior working rule. `feedback-working-rhythm` memory said *"no
credit-burning autonomous loops; merge only what Andrew has tested in the app."*
That rule was protective of two real things: **token spend** and **untested code
reaching prod**. The new design keeps both protections by other means (see below),
so the rule can be relaxed deliberately rather than ignored.

## Decision

Adopt a two-phase **autonomous build workflow**, **global but fenced to software
work** (it governs code projects; it does not change how non-coding/business tasks
are handled). Exposed as a reusable `/autobuild <feature>` command.

**Phase A — Plan everything up front (Andrew present).**
Research the unknowns → `grill-with-docs` to lock every decision → `writing-plans`
to break the feature into **vertical slices** (first slice a thin tracer bullet),
each with a "done when…" checklist → `to-issues` to publish the slices as
**GitHub issues under a per-feature Milestone**, in **dependency order**.

**Phase B — Run till done (Andrew can be away).**
A **Workflow engine** (deterministic background script) drains the milestone in
order. Per slice: a **fresh sub-agent** (clean context) implements it with TDD,
writes the Playwright smoke for it, pushes, and opens a PR. **CI is the trust
gate** — it runs tsc + lint + Vitest + `next build` **plus the Playwright browser
smoke against a seeded local Supabase**. The orchestrator waits for **CI green**,
then merges per the ship boundary below, closes the issue, and moves on.

The eight design decisions (grilled 2026-06-24):

1. **Trust gate is a prerequisite.** The automated browser smoke is what makes it
   safe to remove Andrew from the per-slice check. So the **testing-upgrade slice
   (Playwright smoke in CI on a seeded local Supabase) is built first**, semi-
   supervised, and is the first dogfood of this loop. `/autobuild` is not trusted
   until it exists.
2. **Engine = Workflow, CI = trust gate.** Fresh context per slice dissolves the
   context wall (the orchestrator stays lean). Agents do **not** drive their own
   browser; they write code + the test, and **CI** runs the smoke on a seeded
   copy of the DB — more reliable than an agent juggling a local dev server +
   login. The in-session orchestrator (`subagent-driven-development`) is the
   fallback for small features built at the desk.
3. **Queue = tracker.** GitHub issues under a Milestone are the **durable work
   queue** (survives any context reset — a fresh session or phone pickup just asks
   "next open issue?"). Progress is visible three ways: the **Milestone bar in the
   GitHub mobile app** (glanceable), **push notifications** per slice landing, and
   the **`/workflows`** live tree at the terminal. Built in dependency order.
4. **Phone story = background Workflow + Remote Control**, fully local.
5. **Local persistence.** The run executes **on the local WSL machine** (real
   files, local Supabase, Andrew's setup — not the cloud) inside the existing
   long-lived **`gw` tmux session**. A **watchdog cron** respawns `gw` if it ever
   dies (the laptop is already set to never-sleep), so the session is always-on
   and phone-reachable and **nothing ever needs spawning from the phone**. The
   watchdog is pure bash — **zero tokens**.
6. **Cost posture = anti-spin + bounded self-fix.** A run spends only while
   progressing against the locked plan. On a failure it **self-fixes** with
   genuinely different attempts (≤3, or until two tries make no progress), then
   **stops and pings** with a diagnosis. *Spinning* (repeating the same failing
   action) is banned. Spend is **logged for visibility, not capped** (Andrew is on
   an upgraded Max plan; budget is not a current constraint). Models are tiered
   (cheap for mechanical, best for subtle correctness).
7. **Ship boundary.** **Auto-merge** a "safe" slice on CI-green (UI, logic, a new
   component). **Always stop-and-ping** before deploying anything touching **money
   math, a schema migration, or RLS/auth** — too costly to get wrong silently.
   Not-ready work lands **behind a feature flag** (ADR 0017), never held back.
8. **Scope = global but fenced to software work — hard wall around business/admin.**
   A scoped section in `~/.claude/CLAUDE.md` + a global `/autobuild` command;
   project-specific reality (merge = prod deploy, gate commands, the watchdog) stays
   in this repo. **Explicit exclusion (non-negotiable):** this workflow **never**
   applies to business/admin chats and **never** runs autonomously against **Gmail,
   Google Calendar, Google Drive business docs, or any non-code task.** Those remain
   fully interactive — draft-and-confirm, never auto-send, never auto-act. The rule
   only ever activates inside a software project (a git repo with a build), and
   `/autobuild` is a coding-only command. The autonomous money/schema/RLS hard-stops
   are *in addition to* this wall, not a substitute for it.

## Consequences

- **Positive:** the context wall stops blocking remote work; Andrew plans once and
  watches a milestone bar fill from his phone; the interactive-bug class is caught
  automatically per slice instead of by hand at the end; every future feature
  inherits the trust gate for free.
- **Cost:** more token usage per feature than focused bursts (acceptable on Max);
  a hard dependency on the testing-upgrade existing and staying green; a small
  always-on watchdog process.
- **Protections preserved from the old rule:** *token spend* → anti-spin + bounded
  self-fix + logged spend; *untested code to prod* → CI gate + browser smoke as the
  merge gate, plus the money/schema/RLS hard-stop.
- **Reverses:** the `feedback-working-rhythm` "no autonomous loops / merge only what
  Andrew tested" rule — updated to point here. `build-workflow-standard` gains a
  Phase-A/Phase-B framing. `docs/how-we-work.md` updated in plain English.

## Related

- ADR 0017 (trunk-based vertical slices, no stacked PRs) — the per-slice-to-`main`
  cadence this loop automates; feature flags for not-ready slices.
- `build-workflow-standard`, `feedback-working-rhythm`, `parallel-dev-playbook`
  memories. The testing-upgrade ("testing trophy") this depends on is specified in
  `build-workflow-standard` and gets its own grill + plan as the first slice.
