# Plan — Autonomous build workflow

**Status:** Planned (grilled + locked 2026-06-24). See ADR 0018 for the why.
**Nothing built yet.** This plan changes no config and runs nothing until Andrew says go.

## Goal

Plan a feature once, then let a local agent loop build it to completion — testing
every slice automatically — while Andrew watches a milestone bar fill from his
phone. Fully local on WSL; phone access via Remote Control; **never touches
Gmail / Calendar / business-admin** (hard wall, ADR 0018 §8).

## Sequence (each phase gated on Andrew's go)

### Phase 0 — Document  ✅ (this grill)
- ADR 0018 + this plan. No behavior change.

### Phase 1 — Build the trust gate (the testing-upgrade slice) — semi-supervised
`/autobuild` isn't trusted until the automated browser smoke exists, so this one is
built the normal way with Andrew watching. **It gets its own grill + plan** (it has
real sub-decisions: seed strategy, which guards). Scope target:
- **Playwright** installed + configured (`@playwright/test`).
- **Seeded local Supabase in CI** — `supabase` CLI in GitHub Actions: start, apply
  migrations, seed a fixture. (Free, isolated, off prod data.)
- **Promote the authed browser smoke into CI** on every PR — the manual click-through
  becomes automatic. This is the highest-ROI piece.
- **React Compiler + `react-hooks/unsupported-syntax` as an error** (cheap, preventive).
- *(follow-on, optional)* **pgTAP RLS tests** on policy migrations.
- **DoD:** a PR with a deliberately-broken button fails CI; a good PR goes green; the
  smoke runs against the seeded branch DB, never prod.

### Phase 2 — Build the autonomous harness (once Phase 1 is green)
- **`/autobuild` command** (global, `~/.claude/commands/`) — orchestrates Phase A
  (research → grill-with-docs → writing-plans → to-issues/Milestone) then Phase B
  (the Workflow run-till-done loop). Coding-only.
- **Workflow script template** — the engine: drain milestone in dependency order;
  per slice spawn a fresh implementer (TDD + write the Playwright smoke) → push →
  open PR → wait for CI green → merge per ship boundary → close issue → notify.
  Anti-spin + bounded self-fix (≤3 distinct attempts). Spend logged.
- **Watchdog** — `~/.claude/` cron script that respawns the `gw` tmux session if it
  dies. Pure bash, zero tokens. **DoD:** kill `gw`; within a minute it's back.
- **Config / rules edits:**
  - `~/.claude/CLAUDE.md` — scoped *"Autonomous build workflow (software projects
    only)"* section **with the explicit Gmail/Calendar/business hard-wall**.
  - `feedback-working-rhythm` memory — replace the old "no autonomous loops / merge
    only what Andrew tested" line; point at ADR 0018.
  - `build-workflow-standard` memory — add the Phase-A / Phase-B framing.
  - `docs/how-we-work.md` — plain-English description of the new loop.
- **`settings.json` permission allowlist** — so an unattended run doesn't stall on a
  permission prompt Andrew can't answer from his phone. Generated from real
  transcript history; keeps force-push / `rm` denied. **DoD:** a dry-run build does
  not block on a prompt for the common safe commands.

### Phase 3 — Dogfood
- Run the next real feature (e.g. Mozaik CSV seeding) through `/autobuild`
  end-to-end. Watch from the phone. Retro → harden.

## Ship boundary (per ADR 0018 §7)
- **Auto-merge** safe slices on CI-green.
- **Always stop-and-ping** before deploying money math / schema migration / RLS-auth.
- Not-ready work → **feature flag** (ADR 0017).

## Open sub-decisions (resolve at Phase 1 grill, not now)
- Seed strategy for the CI Supabase (fixture SQL vs scripted).
- React Compiler adopted now vs lint-rule-only first.
- pgTAP in this slice vs a follow-on.
