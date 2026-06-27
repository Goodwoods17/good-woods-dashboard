# 0020. Scheduling: a dual schedule (internal targets + frozen client commitment)

Date: 2026-06-26

## Status

**Accepted.** First slice (S1) of the Scheduling & Client-Commitment Engine
(GitHub Milestone #7). Planned via two `/grill-with-docs` passes + four research
dives + a codebase pre-mortem (see `project-scheduling-engine` memory). Ships
behind `NEXT_PUBLIC_SCHEDULING_ENABLED` (off in prod).

**Amends ADR 0008** (milestones realign to the six phases). It does **not**
reverse 0008 — the ordinal phase-complete gate stays exactly as is. It
**supersedes the implicit "no dates on the Phase axis"** stance that 0008 left in
place: the Phase axis now also carries per-phase **target dates**.

## Context

ADR 0008 made a job's milestones the six phases, 1:1, as a single ordinal
progress-and-cost axis (`currentMilestone` doubles as the phase-complete signal).
It deliberately carried **no dates** — phases were "done or not", positional only.

The shop now needs to **keep client commitments honestly**. The thesis: don't
over-promise at the quote → keep the date with an honest buffer you watch burn →
communicate the slip early when it matters. That requires the schedule to hold
_two_ notions of "when":

1. a **client-committed install date** that the client hears and that must not
   wobble — a frozen promise, and
2. a **live internal plan** (per-phase + job-level) that the shop re-plans freely
   as reality shifts, sitting ahead of the commitment with a **buffer** between.

Collapsing those into one date is the classic failure mode: either you expose
every internal wobble to the client, or you bury the real plan inside the promise
and discover slips too late.

## Decision

Adopt a **dual schedule (CCPM)** on the existing Phase axis. Additive only.

1. **The committed install date stays `jobs.install_date`, unchanged** — the
   single frozen, client-facing promise. It moves only on a deliberate re-commit
   (later slice), never silently.
2. **Internal targets are additive columns on `public.jobs`:**
   - `phase_target_dates jsonb` — per-phase internal target dates, keyed by the
     six `MilestoneStage` phases.
   - `internal_target_date date` — a job-level internal finish, ahead of committed.
   - `buffer_days integer` — the pooled buffer (days) between internal target and
     committed; the contingency that **burns** as phases slip.
     All nullable / default-absent → existing jobs are untouched, no backfill.
3. **The ordinal phase-complete gate (ADR 0008) is unchanged.** `currentMilestone`
   still marks "phase done"; dates are layered on top, not a replacement.
4. **Status is unified into the existing `health` axis, NOT a second badge**
   (codebase pre-mortem fix). S1 ships a thin read-only `on_track / behind`
   indicator derived purely from the current-milestone pointer vs. the current
   phase's internal target; later slices fold that signal into `deriveHealth`.
   `health.ts` is **left unchanged in S1** by deliberate decision.
5. **S1 is a read-only tracer:** open a job → a 6-phase timeline showing per-phase
   targets + the committed date + the buffer + the basic on-track/behind badge.
   No editing, no capacity math, no buffer-burn yet.

## Alternatives considered

- **One date per phase, no separate frozen commitment.** Rejected — every internal
  re-plan would shift the client-facing promise; the whole point is a stable
  commitment with a private, movable plan behind it.
- **A separate `schedule` table / second progress axis.** Rejected — reintroduces
  the two-parallel-axes problem ADR 0008 fixed. Dates belong **on** the Phase
  axis, as attributes of the existing milestones.
- **Compute targets on the fly, store nothing.** Rejected for S1 — capacity-aware
  computation is a later slice; the foundation needs durable columns first so
  later slices have somewhere to write.
- **A standalone "behind" badge alongside `health`.** Rejected by the pre-mortem —
  two competing status pills confuse the owner. Schedule status becomes an input
  to the one `health` signal.

## Consequences

- **Additive migration** (`20260629000000_scheduling_phase_targets.sql`): three
  nullable columns on `public.jobs`; RLS inherited, no backfill, safe to stage
  while the flag is off.
- Touches `shared/lib/types.ts` (Job gains `phaseTargetDates` /
  `internalTargetDate` / `bufferDays`) and `features/jobs/lib/jobsRowMap.ts`
  (row ↔ Job mapping). `health.ts` is intentionally untouched this slice.
- New `features/scheduling/` feature folder: `lib/schedule.ts` (pure
  status/buffer logic, unit-tested), `lib/featureFlag.ts`, and a read-only
  `components/ScheduleTimeline.tsx` rendered on the job detail page behind the flag.
- Later slices build on these columns: capacity-aware committed-date computation,
  risk-tiered buffer sizing + burn, per-sub reliability, the Frappe-Gantt ripple
  view, the client portal/ICS, and the one-way Google push — all sequenced in
  Milestone #7.
