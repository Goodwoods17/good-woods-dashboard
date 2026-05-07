# 0003. Deliberate planning, autonomous execution

Date: 2026-05-07

## Status
Accepted

## Context

Autonomous execution (ADR 0002) is great for "build the thing
correctly" but doesn't help with "build the right thing." Most failed
features are not failures of execution — they are failures of
specification. The model built exactly what was asked, but what was
asked wasn't what was actually needed.

Without a deliberate planning phase, autonomous mode amplifies
specification errors: Claude builds quickly in the wrong direction,
then has to be told to undo or rebuild.

## Decision

Split the feature lifecycle into three explicit phases with different
operating modes:

1. **Plan** (`/plan-feature`) — deliberate, interview-driven,
   one question at a time, includes web research, produces a written
   spec at `features/<name>/CLAUDE.md` and a plan at
   `features/<name>/PLAN.md`. Requires explicit Chilly approval before
   spec is finalized.

2. **Scaffold** (`/feature`) — mechanical, runs from spec, no
   questions, creates file structure and wires into index.html.

3. **Build** (`/work`) — autonomous execution, reads spec and plan,
   implements one phase at a time, updates PLAN.md as it goes.

The transition from Phase 1 to Phases 2-3 is the only blocking
checkpoint. After spec approval, everything is autonomous.

## Alternatives considered

- **Pure autonomous (no planning phase)** — Rejected. Leads to
  building the wrong thing fast.
- **Planning every change, no autonomous mode** — Rejected. Defeats
  background-mode operation; Chilly is too busy with shop work to
  drive every change.
- **Optional planning** — Rejected. "Optional" means "skipped under
  pressure." Mandatory `/plan-feature` for new features makes the
  cost of skipping explicit (Claude refuses to scaffold without a
  spec).

## Consequences

**Positive:**
- Specification errors caught at planning, not after building
- Written spec means Claude can resume work weeks later without
  re-interviewing
- Research phase surfaces ideas Chilly might have missed
- Non-goals captured explicitly, preventing scope creep
- PLAN.md gives Claude a roadmap, so `/work` sessions don't have to
  re-derive the approach

**Negative:**
- New feature has a 15–30 minute upfront cost (the interview)
- Forces Chilly to articulate things he might not have thought through
  (this is actually a feature, not a bug, but it is friction)
- Spec can drift from reality if not maintained — must be updated
  when scope genuinely changes

## Revisit when

- A pattern emerges where specs are consistently right but interviews
  feel redundant (could shorten the question set)
- A pattern emerges where research phase surfaces nothing useful
  (could drop or shorten it)
- A feature is so small that the planning ceremony costs more than
  it saves (could add a `/plan-feature --quick` mode)
