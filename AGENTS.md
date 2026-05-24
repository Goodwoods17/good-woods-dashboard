# Good Woods Dashboard — agent guide

Single-user cabinet-shop operations dashboard. Built with Claude Code
in autonomous mode. This file briefs new agents on what to read before
acting in this repo.

## Read these first

1. **`README.md`** — stack, feature folder layout, dev scripts.
2. **`PRODUCT.md`** — strategic brief: register, users, JTBD,
   personality, anti-references, design principles. Canonical for
   tone and brand.
3. **`DESIGN.md`** — visual system in Stitch six-section format.
   Canonical for visual tokens, typography, components, do's and
   don'ts. The "Sharp, quiet, focused" Lit Workshop direction was
   locked 2026-05-24.
4. **`docs/domain.md`** — domain glossary for cabinetry and shop
   terminology. Use this vocabulary in code, comments, UI copy.
5. **`docs/decisions/`** — architectural decision records. ADR 0004
   supersedes 0001 on stack choice.
6. **`docs/build-direction-spec.md`** — background module wireframes
   (Spec v0.2). On tone/brand it's been superseded by PRODUCT.md +
   DESIGN.md; on wireframes and module behaviour it still wins.

## Per-feature specs

Every feature folder under `features/<name>/` has its own `CLAUDE.md`
that describes what the feature does, where its code lives, and the
domain rules specific to it. Read the relevant one before changing a
feature.

## Agent skills

Configuration for the Matt Pocock engineering skills (`triage`,
`to-issues`, `to-prd`, `diagnose`, `tdd`, etc.) lives under
`docs/agents/`.

### Issue tracker

Issues live in GitHub Issues at `Goodwoods17/good-woods-dashboard`.
Use the `gh` CLI for all operations. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

Five canonical triage labels with their default names: `needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See
[`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context repo. Domain glossary at `docs/domain.md` (not the
conventional `CONTEXT.md`). ADRs at `docs/decisions/` (not
`docs/adr/`). See [`docs/agents/domain.md`](docs/agents/domain.md).
