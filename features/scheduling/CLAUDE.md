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

## Non-goals (S1)

No editing of dates, no capacity-aware committed-date computation, no buffer-burn,
no per-sub reliability, no Gantt, no client portal/ICS, no Google push. Those are
later slices in Milestone #7. `health.ts` is intentionally untouched this slice.
