# 0002. Autonomous Claude Code workflow

Date: 2026-05-07

## Status
Accepted

## Context

Chilly runs Claude Code in auto mode and lets it work in the
background while attending to shop work. Frequent prompts for
clarification or approval interrupt the workflow and defeat the
point of running autonomously.

At the same time, removing all checks creates risk: a wrong assumption
or destructive operation could damage the codebase or lose work.

## Decision

Operate in autonomous mode by default with the following structure:

1. **Action over questions.** Make reasonable decisions and document
   them. Only stop and ask when a hard constraint conflicts, the shop
   math is genuinely ambiguous, or a destructive operation is needed.

2. **Verify automatically.** After every change, run a self-verification
   pass (`/verify`) that catches the things a human review would catch:
   syntax issues, constraint violations, convention drift, integration
   breakage, stale documentation.

3. **Document decisions in writing.** Anything significant goes into
   `docs/decisions/` as an ADR. Anything minor goes into a code
   comment. This way Chilly can review at his leisure rather than
   being interrupted.

4. **Open auto-allow list, strict deny list.** Routine file and Git
   operations don't prompt. Genuinely dangerous operations (rm,
   git push --force, git reset --hard) are denied outright. The "ask"
   list is small.

5. **Self-correct, don't surface, when possible.** If `/verify`
   finds an issue Claude introduced, it fixes it. Only unresolvable
   issues surface to Chilly.

## Alternatives considered

- **Full review-every-change workflow** — Rejected. Defeats the
  point of background operation. Chilly would spend more time
  approving than getting shop work done.
- **No checks at all (full YOLO)** — Rejected. Unacceptable risk of
  silent breakage, especially as the codebase grows.
- **Periodic batched reviews** — Considered. May still happen
  organically, but not the primary safety mechanism. ADRs and Git
  history serve the same purpose with less ceremony.

## Consequences

**Positive:**
- Chilly can give a task and walk away without being interrupted.
- Decisions are recorded, so review can happen async.
- Risk surface is bounded by deny rules and auto-verification.
- Faster iteration on shop tooling.

**Negative:**
- Some autonomous decisions will be wrong. Mitigated by Git rollback,
  ADR documentation making them visible later, and the small surface
  area of any single change.
- Risk of silent constraint drift if `/verify` misses something.
  Mitigated by treating CLAUDE.md constraints as hard rules, not
  guidelines.
- Requires discipline around CLAUDE.md being kept current — it's the
  source of truth Claude operates from.

## Revisit when

- A pattern of bad autonomous decisions emerges (suggests CLAUDE.md
  needs more guidance)
- Chilly wants tighter control on a specific class of changes
  (add to the "ask" list)
- The deny list catches something that should have been allowed
  (loosen specific rules)
