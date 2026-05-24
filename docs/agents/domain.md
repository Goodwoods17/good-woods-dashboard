# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## This repo's layout

**Single-context.** One domain glossary, one ADR folder, both at non-standard paths:

- Domain glossary lives at **`docs/domain.md`** (not the conventional `CONTEXT.md` at the repo root).
- ADRs live at **`docs/decisions/`** (not the conventional `docs/adr/`).

When a skill says "read CONTEXT.md", read `docs/domain.md`. When a skill says "read docs/adr/", read `docs/decisions/`. The content type is the same; only the path differs.

## Before exploring, read these

- **`docs/domain.md`** — domain glossary for cabinetry, hardware, materials, finishing, and project terminology. Use these terms precisely in code, comments, variable names, and UI copy.
- **`docs/decisions/`** — five existing ADRs. Read whichever touches the area you're about to work in. ADR 0004 supersedes ADR 0001 on stack choice; ADR 0003 + 0002 govern the autonomous workflow.

If any of these files don't exist or are sparse on the topic you need, **proceed silently**. Don't flag their absence upfront — the producer skill (`/grill-with-docs`) creates and extends them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/domain.md`. Don't drift to synonyms the glossary explicitly avoids. Cabinetry terms are specific: "stile" is not "vertical piece"; "carcass" is not "box"; the "32mm system" is a precise European construction standard, not a generic measurement.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR 0004 (Next.js + Supabase canonical) — but worth reopening because…_

## Related project docs (not domain docs per se, but agent-relevant)

These aren't part of the formal CONTEXT / ADR system, but skills should know about them:

- **`PRODUCT.md`** at the repo root — strategic brief. Read before any UX/UI work.
- **`DESIGN.md`** at the repo root — visual system. Read before any visual change.
- **`docs/build-direction-spec.md`** — module wireframes (Spec v0.2). Background reference for module behaviour and Phase-1 wireframes. On tone/brand it's been superseded by PRODUCT.md + DESIGN.md.
- **`features/<name>/CLAUDE.md`** — per-feature specs. Read the relevant one before changing a feature.

## File structure

```
/
├── PRODUCT.md                 ← strategic brief (canonical for tone/brand)
├── DESIGN.md                  ← visual system (canonical for visuals)
├── README.md
├── AGENTS.md                  ← this guide's parent
├── .impeccable/design.json    ← design-system sidecar
├── docs/
│   ├── domain.md              ← THE glossary (read this)
│   ├── decisions/             ← THE ADRs (read these)
│   │   ├── 0001-plain-html-no-framework.md
│   │   ├── 0002-autonomous-workflow.md
│   │   ├── 0003-deliberate-planning.md
│   │   ├── 0004-nextjs-not-plain-html.md
│   │   └── 0005-no-notion-integration.md
│   ├── build-direction-spec.md   ← background module wireframes
│   └── agents/                ← agent-skill configuration (this file lives here)
└── features/
    └── <name>/
        ├── CLAUDE.md          ← per-feature spec
        ├── components/
        └── lib/
```
