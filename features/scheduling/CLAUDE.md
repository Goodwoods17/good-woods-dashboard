# Scheduling & Client-Commitment Engine

Milestone #7. Lights schedule up as a **status axis** across the app, not a
standalone page. **Ships behind `NEXT_PUBLIC_SCHEDULING_ENABLED`** (off in prod;
CI sets it on). Design + locked decisions: ADR 0020 + the
`project-scheduling-engine` memory.

## Core model (ADR 0020)

**Dual schedule (CCPM):** a live, movable set of **internal targets** against one
**frozen client-committed install date** (`jobs.install_date`, unchanged), with a
pooled **buffer** absorbing the gap. Internal targets are additive columns on
`public.jobs`:

- `phase_target_dates jsonb` — per-phase internal targets, keyed by the six
  `MilestoneStage` phases.
- `internal_target_date date` — job-level internal finish.
- `buffer_days integer` — pooled buffer (days); null = 0.

The ordinal phase-complete gate from ADR 0008 is unchanged. Schedule status is
**unified into the existing `health` axis** (later slices), never a second badge.

## What's here (S1 foundation, issue #89)

```
features/scheduling/
├── lib/
│   ├── featureFlag.ts   schedulingEnabled() — reads NEXT_PUBLIC_SCHEDULING_ENABLED
│   └── schedule.ts      pure: scheduleStatus / committedDate / bufferDaysFor (+ test)
└── components/
    └── ScheduleTimeline.tsx   read-only 6-phase timeline on the job detail page
```

`scheduleStatus(currentMilestone, phaseTargetDates, today)` → `on_track | behind`,
derived ONLY from the current-milestone pointer vs. the current phase's target
(behind once today passes it; UTC end-of-day so it's timezone-independent).

## What's here (S2 capacity/load, issue #90)

```
features/scheduling/
├── lib/
│   └── capacity.ts   pure: phase capacity/load model + seed-from-history (+ test)
└── components/
    └── PhaseCapacityPanel.tsx   flag-gated "Capacity" tab on /labour
```

The six `MilestoneStage` phases double as shop **work-centers**. `capacity.ts`:

- `buildCapacityModel(sessions, capacityByPhase, windowStart, windowEnd)` → one
  row per phase with derived **load** (active hours from `labour_sessions`
  history in the window), configured **capacity**, and `under | near | over`
  status. Load is derived at read time — never stored.
- `seedPhaseDurationsFromHistory(sessions)` → default phase durations (work days)
  for a **new job**, from the average active hours *per job per phase* in history
  (the "garbage-in fix" — uses data we already have). Falls back to
  `DEFAULT_PHASE_DURATION_DAYS` per-phase when there's no history.
- `phaseTargetDatesFromDurations(start, durations)` chains those durations
  (weekends skipped) into the S1 `phase_target_dates` shape.

Capacity persists in `public.scheduling_phase_capacity` (one row per phase,
`weekly_capacity_hours`, seeded at 40; migration
`20260630000000_scheduling_phase_capacity.sql`). The panel reads it (fallback to
`DEFAULT_WEEKLY_CAPACITY_HOURS`) and reads sessions via the labour store.

## What's here (S3 committed date + buffer + bottleneck, issue #91)

```
features/scheduling/
└── lib/
    └── committedDate.ts   pure: capacity-aware schedule + risk-tiered buffer
                           + variance nudge + floating bottleneck (+ test)
```

`committedDate.ts` adds five pure functions (28 unit tests):

- `capacityAdjustedDuration(baseDays, ratio)` — stretches a phase's base duration
  by the load ratio (capped at `MAX_CAPACITY_STRETCH = 3×`) so an over-loaded
  work-center is reflected in the schedule rather than ignored.
- `computeCapacityAwareSchedule(startDate, phaseDurations, phaseRows)` — forward-
  schedules a job by chaining the capacity-adjusted durations (weekends skipped),
  returning `phaseTargetDates`, `internalTargetDate`, and `totalWorkDays`.
- `computeRiskTieredBuffer({ totalInternalDays, subDependencyCount, varianceNudgeDays, overrideBufferDays })` — three auditable buffer terms:
  - base = `ceil(totalInternalDays × 15%)` — scales with job size
  - subs = `subCount × 3d` — external sub-trade lead-time contingency
  - variance = derived from `phaseVarianceNudgeDays`
  - Overridable per job via `jobs.buffer_days` (already in the schema from S1).
- `phaseVarianceNudgeDays(sessions)` — per-phase stdDev of historical per-job hours
  → work days, summed and capped at 5d; phases with < 2 jobs contribute nothing.
- `capacityAwareCommittedDate(internalTargetDate, bufferDays)` — adds the buffer
  (work days, weekends skipped) to land the client-committed install date.
- `detectFloatingBottleneck(phaseRows)` — the most-overloaded (`over` or `near`)
  phase from the S2 capacity model; null when all phases have room; floats weekly.

UI surfaces:

- `PhaseCapacityPanel` — gains a bottleneck banner (`data-testid="floating-bottleneck"`)
  and a "Capacity-aware committed date" section with the risk-buffer breakdown and
  `data-testid="recommended-commit-date"`.
- `ScheduleTimeline` — gains a `data-testid="risk-buffer-breakdown"` row below the
  phase timeline, showing the three buffer components from the job's stored data.

No new schema migration — the `jobs.buffer_days` override was added in S1.

## What's here (S5 editable Gantt, issue #93)

```
features/scheduling/
├── lib/
│   └── gantt.ts        pure: addWorkDays / workDaysBetween / rippleForward /
│                        pullPlanBackward (+ gantt.test.ts — 25 unit tests)
└── components/
    └── GanttSchedule.tsx   Frappe Gantt (MIT) wrapper with ripple/pin UI
types/
└── frappe-gantt.d.ts   minimal TypeScript declarations for frappe-gantt
```

`GanttSchedule` renders on the job detail page below `ScheduleTimeline`
(behind `SCHEDULING_ENABLED`). Key behaviours:

- **Drag-to-reschedule** via Frappe Gantt's `on_date_change` callback →
  `rippleForward` cascades the delta to all downstream phases.
- **Pinnable anchors** — each phase has a pin button. Pinned phases can't shift;
  the ripple emits `ConflictWarning` and shows an alert row. Apply is disabled
  while conflicts exist (never silently violates).
- **Pin Install → pull-plan backward** — pinning the install phase calls
  `pullPlanBackward`, which re-derives all preceding phase targets from the
  install date using `DEFAULT_PHASE_DURATION_DAYS`.
- **Preview + Undo** — changes are staged in local state; the user sees a
  diff table (current vs. proposed) and must click Apply to commit.
  Undo reverts to the committed dates with no API call.
- **Apply** calls the `onUpdate` prop (wired to `updateJob` in `JobDetail`)
  which persists `phaseTargetDates` to Supabase.

No new schema migration — `jobs.phase_target_dates` already exists from S1.
Ripple stays in the Gantt (not the month-calendar drag, per the pre-mortem
decision in the issue).

## Non-goals (S1–S5)

No per-machine / per-person capacity (phase-level only in v1), no auto-write
of derived durations into new-job creation, no buffer-burn fever chart, no
per-sub reliability loop, no client portal/ICS, no Google push. Those are
later slices in Milestone #7. `health.ts` stays untouched.
