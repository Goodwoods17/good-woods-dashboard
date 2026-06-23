# 0013. External blockers are a structured source of truth that derives job health

Date: 2026-06-22

## Status

**Accepted.** Resolved in a grilling session with Andrew, 2026-06-22, while scoping
the external-blockers slice (B2). Builds on the shop-floor capture work (Slice B), which
introduced the **`stuck` Work card** (an *internal* shop task) and explicitly carved out
the *external* blocker as a distinct, project-level concept (see `docs/domain.md` →
**External blocker**, and the Slice B design doc). Relates to ADR 0008 (milestones = the
6 phases) for the phase a blocker gates.

## Context

A project routinely stalls on an **outside party**: client sign-off on shop drawings, a
designer's approved handle selection, a building permit, a supplier ship date. Until now
the only place to record this was the free-text `jobs.blocker` string, which cannot be
counted, aged, attributed to a party, or tied to the phase it gates. It also collides with
the synthetic demo-blocker fallback in `features/jobs/lib/blockers.ts`.

We want external blockers to be **first-class**: *what* we wait for, *who* we wait on,
*since when* (so it ages), and *which phase it gates* — and to drive the job's health, the
Hitlist, the Schedule, the briefing, the milestone-advance flow, and the shop board from
one place.

The genuine alternatives considered:

- **Keep free-text `job.blocker`** + a convention. Rejected: no aging, no party, no phase,
  no count; can't gate or rank reliably.
- **Write-through**: an "add blocker" action writes `job.blocker` text + sets
  `health_status = 'blocked'`, and "resolve" clears them. Rejected: two sources of truth
  that drift, and manual `job.blocker` edits collide with structured ones.
- **A new health enum value** (`externally_blocked`) distinct from `blocked`. Rejected for
  v1: it ripples through every `HealthStatus` switch (pills, ranking, briefing, filters) for
  a distinction Andrew didn't want yet — an externally-blocked job *should* sit at the top of
  the Hitlist like any blocked job, because it's exactly what he should action.

## Decision

1. **A `job_blockers` table is the source of truth.** Columns: `job_id` (text FK → jobs,
   cascade), `reason`, `waiting_on_contact_id` (nullable FK → contacts) + `waiting_on_label`
   (free fallback), `gated_phase_id` (nullable; one of the 6 phases), `raised_at`,
   `resolved_at` (null = active). RLS authenticated-only. Active = `resolved_at is null`.

2. **Health is derived on read, not written through.** An active blocker makes a job's
   **effective health `blocked`** and supplies the real (non-synthetic) blocker chip, layered
   into the existing `deriveHealth` / `resolveBlockerText` / `resolveBlockerTone` via an
   optional `activeBlockers` argument threaded to all ~8 call sites. Resolving a blocker
   clears the derived state with no manual cleanup. **Precedence:** `complete` > manual
   `paused` > active-blocker → `blocked` > schedule-derived.

3. **The soft milestone gate only fires for phase-specific blockers.** Advancing a phase
   whose `gated_phase_id` matches warns ("externally blocked — advance anyway?") but allows.
   A **whole-job** blocker (`gated_phase_id = null`) flags health only and never gates an
   advance — so normal work isn't nagged while a permit is pending.

4. **Externally-blocked ranks at the top of the Hitlist** (same `blocked` bucket as
   schedule-blocked), because a blocker is the action item.

## Consequences

- **Reversal cost is real** (hence this ADR): the data model, the `deriveHealth` precedence
  rule, and the conflation of "externally blocked" into the existing `blocked` enum value are
  all load-bearing. Splitting `externally_blocked` out later, or moving to write-through,
  means a data migration plus re-threading the derivation.
- **`blocked` health now has two meanings** (schedule-behind OR externally-blocked). This is
  deliberate for v1 (both are "top of the Hitlist, needs action") but is the most likely thing
  a future reader will question — documented here so the choice is legible.
- Free-text `job.blocker` stays as a fallback for jobs with no structured blocker (no data
  migration in this slice); the synthetic demo-blocker path is unchanged when both are absent.
- The 6 `gated_phase_id` values are validated against `PHASE_ORDER` (= `MilestoneStage`),
  which are identical sets, so the value is unambiguous for both the job milestones and the
  shop board.
