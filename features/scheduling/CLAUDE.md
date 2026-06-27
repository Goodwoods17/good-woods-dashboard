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

## Non-goals (S1–S2)

No editing of dates **or capacity values** in the UI yet, no per-machine /
per-person capacity (phase-level only in v1), no auto-write of the derived
durations into new-job creation (the panel *previews* them — wiring into the
`/jobs/new` form is a later slice), no capacity-aware committed-date computation,
no buffer-burn, no per-sub reliability, no Gantt, no client portal/ICS, no Google
push. Those are later slices in Milestone #7. `health.ts` stays untouched.
