# 0008. Job milestones realign to the six phases (one progress-and-cost axis)

Date: 2026-06-20

## Status

**Accepted.** Prerequisite for the cost-codes / live job-costing feature
(spec: `docs/superpowers/specs/2026-06-20-cost-codes-job-costing-design.md`).
Planned via a `/grill-with-docs` session (2026-06-20); glossary updated in
`docs/domain.md` the same day.

## Context

The job's `MilestoneStage` enum (`sold · materials · cut · assemble · finish ·
install`) tracks schedule progress as a single `currentMilestone` pointer.
Independently, labour and the estimator group work into six **phases**
(`Design · CNC/Cut · Assembly · Finishing · Delivery · Install`). Four already
coincide (`cut/assemble/finish/install` ≈ CNC/Assembly/Finishing/Install); only
**Design** and **Delivery** had no milestone, and **`materials`** had no phase.

The new live job-costing feature needs a per-phase "is this done?" signal — to
lock a phase's actual cost and bank an under-budget win. Coupling that to the old
milestone list was broken for Design and Delivery (no milestone): a category
error, because the two lists almost-but-not-quite matched.

## Decision

**The job's milestones ARE the six phases, 1:1.** `MilestoneStage` becomes
`design · cnc · assembly · finishing · delivery · install` (matching the
`labour_categories` ids), and `currentMilestone` doubles as the
cost-phase-complete signal.

1. Each milestone carries a completion definition (surfaced as the per-stage hint
   in `TasksTab`):
   - **Design** — client sign-off on approved shop drawings + contract + estimate.
   - **CNC/Cut** — parts cut. **Assembly** — boxes assembled. **Finishing** —
     finish complete.
   - **Delivery** — all parts delivered to site. **Install** — installed.
2. The old **`sold`** milestone folds into **Design** (the Design gate already
   includes the contract). The sales "sold" state still lives in `PipelineStatus`,
   which is unchanged.
3. The old **`materials`** ("raw stock received") folds into Design/CNC as a hint,
   not a top-level gate.
4. **Phase complete** = `currentMilestone` at or past that phase (ordinal). A job
   reaching `pipelineStatus = complete` locks all phases to actual.
5. **Data backfill** maps existing `current_milestone` values: `sold→design`,
   `materials→cnc`, `cut→cnc`, `assemble→assembly`, `finish→finishing`,
   `install→install`.

## Alternatives considered

- **Keep milestones as a separate schedule axis; add a costing-only "phase closed"
  toggle.** Rejected — two parallel progress concepts to maintain, and Andrew
  defined Design/Delivery as real job gates, not costing-only states.
- **Add Design + Delivery as extra milestones while keeping `sold` + `materials`.**
  Rejected — an 8-stage list that no longer maps cleanly to the six cost phases;
  the costing math wants a clean 1:1.
- **Drop completion detection; project every phase at `max(actual, budget)`.**
  Rejected — never banks an under-budget win; Andrew wants to see when a phase
  closes ahead so he can keep a healthy job on track.

## Consequences

- **Breaking enum + data backfill.** `MilestoneStage` values change; a migration
  rewrites `jobs.current_milestone`. Touches `shared/lib/types` (enum +
  `MILESTONE_STAGES`), `MilestonesStrip`, `TasksTab` hints, `activity.ts` wording,
  the seeds, the briefing prompt, and `createJobFromEstimate`.
- **Phase and milestone are now one ordered axis** (cost grouping = schedule gate);
  `PipelineStatus` remains the separate sales pipeline. Glossary updated in
  `docs/domain.md`.
- Unblocks the cost-codes feature's projected-margin math (phase-complete signal)
  with no separate toggle.
- Sequenced as a **prerequisite step** in the cost-codes `PLAN.md`, before the
  Budget-vs-Actual tab.
