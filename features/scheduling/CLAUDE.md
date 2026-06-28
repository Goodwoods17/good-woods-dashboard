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

## What's here (S10 shop-floor targets + advisory banner, issue #98)

```
features/scheduling/
├── lib/
│   └── shopFloor.ts   pure: daysUntil / phaseTargetPaceStatus /
│                       phaseTargetLabel / phaseBottleneckAdvisory (+ test)
└── components/
    ├── PhaseTargetBadge.tsx     inline "by Mon · 3d left · on pace" badge
    │                            rendered in each JobStatusTab phase header
    └── BoardAdvisoryBanner.tsx  advisory-only banner on the /status board
                                 when the most-behind active job is flagged
```

`JobStatusTab` (job-status feature) now accepts an optional `phaseTargetDates`
prop. `StatusBoard` passes `job.phaseTargetDates` down and renders
`BoardAdvisoryBanner` above the job grid. Both render nothing when the flag is
off or no target is set — fully additive.

Per-phase paceStatus (`on_pace | due_today | behind`) drives badge colour:
green / amber / red. The advisory message is purely informational; it never
blocks any crew action.

No schema migration — `jobs.phase_target_dates` already exists from S1.

## What's here (S12 make-ready gate, issue #100)

```
features/scheduling/
├── lib/
│   └── makeReady.ts         pure: STANDARD_MAKE_READY_ITEMS / buildMakeReadyItems /
│                             applyAutoSignals / phaseIsReady / makeReadySummary (+ test)
└── components/
    └── MakeReadyChecklistPanel.tsx   per-phase readiness checklist in the Schedule tab
supabase/migrations/
└── 20260702000000_scheduling_make_ready.sql   scheduling_make_ready_items table
```

Last-Planner make-ready principle: before committing to start a phase, verify all
prerequisites are in place. `makeReady.ts`:

- `STANDARD_MAKE_READY_ITEMS` — per-phase standard checklist seeded from shop best
  practice (issue spec: CNC: "Drawings final" + "Materials ordered" + "Toolpath / CNC
  file ready").
- `buildMakeReadyItems(phase, saved?)` — merge stored state (checked/overridden) onto
  standard items; defaults all to unchecked.
- `applyAutoSignals(items, signals)` — tick items whose named signal has fired
  (`design_signoff` | `blocker_resolved` | `material_logged`). Pure: never mutates input.
- `phaseIsReady(items)` — true when every item is checked OR overridden (soft gate,
  ADR 0013: warns but never blocks progress).
- `makeReadySummary(items)` — `{ total, checkedCount, ready, hasOverride }` for the badge.

`scheduling_make_ready_items` stores per-job checklist state: `template_item_id`,
`checked`, `overridden`, `auto_signal`, etc. RLS authenticated-only.

`MakeReadyChecklistPanel` renders inside `ScheduleTab`:
- Loads saved state from Supabase; merges onto standard items.
- Applies auto-signals at render time (signals derived from Job in ScheduleTab).
- Per-phase sections with `data-testid="make-ready-phase-<phase>"`.
- "Not ready" amber warning when items are outstanding (soft gate: `data-testid="make-ready-warning-<phase>"`).
- "Proceed anyway" button per unchecked manual item (`data-testid="make-ready-override-<id>"`).
- Persists check/override state to Supabase via upsert on `(job_id, template_item_id)`.

Auto-signals wired in `ScheduleTab.tsx` from `Job`:
- `designSignoff`: `currentMilestoneIndex > 0` (past design = drawings approved)
- `blockerResolved`: `!job.blocker` (no free-text blocker = no outstanding block)
- `materialLogged`: `false` for now (requires job-items store, wired in a future slice)

## What's here (S13 commitment ledger + two-level ownership, issue #101)

```
features/scheduling/
├── lib/
│   └── commitmentLedger.ts   pure: SHOP_OWNER / ownerKey / buildCommitmentLedger /
│                             computeOwnerReliability / ownerReliabilityBufferDays (+ test)
└── components/
    └── CommitmentLedgerPanel.tsx   two-level ledger + per-owner reliability in the Schedule tab
supabase/migrations/
└── 20260703000000_scheduling_commitment_ledger.sql   jobs.phase_owners + commitment_ledger table
```

Dates-as-promises (Flores / Last-Planner): every date is an explicit commitment
with a **named owner**, at two levels — the client-committed install (shop-owned)
and each phase's internal target (person/subtrade-owned). `commitmentLedger.ts`:

- `SHOP_OWNER` — the default owner of any unassigned commitment.
- `ownerKey(owner)` — stable `kind:id` (falls back to `kind:name`) identity key.
- `buildCommitmentLedger(job, today)` — derives the ledger at read time from
  `installDate` + `phaseTargetDates` + `phaseOwners`: the client entry first, then
  one entry per phase with a target, each with its owner + derived status
  (`kept` if the job has moved past the phase; else `missed`/`open` by date).
- `computeOwnerReliability(records)` — per-owner roll-up (incl. subtrades), sorted
  worst-first: `{ total, kept, missed, missRate }`.
- `ownerReliabilityBufferDays(records, base=3)` — generalizes S11's sub-only
  `computeSubReliabilityBufferDays` to **all owner kinds**; `ceil(missRate × base)`
  summed. **Feeds the S3 risk-tiered buffer** via the new additive
  `ownerReliabilityDays` term on `computeRiskTieredBuffer` (the buffer learns which
  owners to trust).

Schema (additive, nullable): `jobs.phase_owners jsonb` (phase → `{kind,id,name}`,
absent = shop) + `public.commitment_ledger` (durable per-owner promise outcomes;
RLS authenticated-only + anon-none). `Job.phaseOwners` + `jobsRowMap` carry the
column. `CommitmentLedgerPanel` renders in `ScheduleTab`:
`data-testid="commitment-ledger-panel"`, `ledger-entry-client`,
`ledger-entry-phase-<phase>` (with `data-status` + `data-owner-kind`),
`owner-reliability`, `owner-reliability-<ownerKey>`, `owner-reliability-buffer-days`.

## What's here (S14 re-commit flow + revision history + change orders, issue #102)

```
features/scheduling/
├── lib/
│   └── recommit.ts   pure: RECOMMIT_REASON_CODES / reasonCodeMeta / dingsReliability /
│                      recommitRecoveryGate / changeOrderImpact / pushCommittedDate /
│                      buildCommitmentRevision / draftRecommitEmail (+ test)
└── components/
    └── RecommitPanel.tsx   re-commit + change-order form + revision history in the Schedule tab
supabase/migrations/
└── 20260704000000_scheduling_commitment_revisions.sql   commitment_revisions table
```

The client-committed install date is a **versioned promise** — never silently
overwritten. `recommit.ts` (pure, 12 unit tests):

- `RECOMMIT_REASON_CODES` / `reasonCodeMeta(code)` — the reason-code catalogue;
  each carries `attributable` (shop's fault → feeds the PPC scorecard, S25).
- `dingsReliability(kind, reasonCode)` — a **change order never dings** (deliberate
  scope decision); a plain re-commit dings only on a shop-attributable reason.
- `recommitRecoveryGate(zone)` — **recovery-first**: a re-commit is only
  recommended once the buffer is truly blown (RED). Change orders bypass it.
- `changeOrderImpact(addedWorkDays, remainingBufferDays)` — small change orders
  **absorb into buffer** (no date move); larger ones push the date by the overflow.
- `pushCommittedDate(date, deltaWorkDays)` — work-day arithmetic (reuses S3).
- `buildCommitmentRevision(input)` — assembles a versioned revision (old/new date,
  fresh buffer, reason, who/when) with the derived ding flag.
- `draftRecommitEmail(input)` — early + concrete client email draft for approval;
  different copy for re-commit vs. change order.

Schema (additive): `public.commitment_revisions` — one immutable row per deliberate
committed-date change (kind, reason, old/new date, fresh buffer, dings_reliability,
who/when; `job_id text` FK to `jobs.id`; RLS authenticated-only + anon-none).
`RecommitPanel` renders in `ScheduleTab` and persists via `onRecommit` (wired to
`updateJob(installDate, bufferDays)` in JobDetail). Testids:
`recommit-panel`, `recommit-zone-pill`, `recommit-recovery-note`,
`recommit-kind-recommit` / `recommit-kind-change-order`, `recommit-reason-select`,
`recommit-added-days-input`, `recommit-change-order-impact`, `recommit-new-date-input`,
`recommit-new-buffer-input`, `recommit-dings-badge`, `recommit-email-draft`
(`-subject` / `-body`), `recommit-submit`, `recommit-revision-history`,
`recommit-revision-<id>`.

## What's here (S18 client schedule portal — read-only, on-track, issue #106)

```
features/scheduling/
├── lib/
│   ├── clientPortal.ts            pure: client-safe schedule view (status / % done /
│   │                              next step / firm install + soft mid-phase ranges) (+ test)
│   ├── scheduleShareLinksRowMap.ts row ↔ ScheduleShareLink
│   └── scheduleShareLinkServer.ts  server-only: loadScheduleShareLink(token) (service role)
└── components/
    ├── ClientScheduleView.tsx      the public read-only portal page body
    ├── ClientScheduleInactive.tsx  clean inactive state (revoked / unknown / unconfigured)
    └── ClientPortalPanel.tsx       owner mint/copy/revoke panel in ScheduleTab
src/app/s/[token]/page.tsx          public no-login route (flag-gated; 404s when off)
supabase/migrations/
└── 20260706000000_scheduling_share_links.sql   schedule_share_links table
```

A tokenized, READ-ONLY, no-login client view of ONE job's schedule, reusing the
Forms P2 share-link pattern (opaque token = capability, service-role read,
`*_anon_none` RLS, `/s` added to the middleware public-routes allowlist). The
client sees a friendly milestone stepper, % done, next step, a soft **week
RANGE** per mid-phase, and ONE **firm** install day — the frozen client promise.
**Buffer / internal targets / fever chart NEVER reach the page**: the route is a
server component that computes `buildClientScheduleView` server-side and passes
only the safe result to the browser (raw `phase_target_dates` never serialize).

- `clientPortal.ts` (pure, 16 unit tests): `clientScheduleStatus` (on_track →
  date_updated ONLY when the live committed date diverges from the link's
  snapshot), `clientPercentDone` (completed-phase share — install reads 83%),
  `clientNextStepLabel` + `CLIENT_PHASE_LABELS` (client-friendly names; hide the
  "CNC" shop term), `businessWeekWindow` (Mon–Fri fuzz of an internal target →
  range), `buildClientScheduleView` (assembles the whole safe view).
- `schedule_share_links` (additive): `job_id text` FK → `jobs.id`, opaque `token`,
  `committed_date_snapshot date` (frozen install at mint time), `viewed_at`,
  `revoked_at`; RLS authenticated_all + anon_none. `committedDateSnapshot` is the
  honest-promise anchor — the client view flips to "Date updated" only when the
  firm install date actually moves away from it. Owner mints the link as the
  authenticated user; the public page reads it via the service role.
- Testids: `client-schedule-view`, `client-status-pill` (`data-status`),
  `client-percent-done`, `client-current-stage`, `client-next-step`,
  `client-install-date`, `client-date-updated-note`, `client-step-<phase>`
  (`data-state`), `client-step-window-<phase>`, `client-schedule-inactive`;
  owner panel: `client-portal-panel`, `client-portal-create`,
  `client-portal-link-row`, `client-portal-url`, `client-portal-copy`,
  `client-portal-revoke`.

## What's here (S21 client add-to-calendar — subscribable ICS feed, issue #109)

```
features/scheduling/
├── lib/
│   └── clientCalendar.ts   pure: buildClientCalendar → RFC 5545 ICS string (+ test)
└── components/
    └── AddToCalendar.tsx    client island: subscribe (webcal) / Google / download buttons
src/app/s/[token]/feed.ics/route.ts   public no-login tokenized ICS feed (service role)
```

A tokenized, subscribable ICS feed per client at `/s/<token>/feed.ics`, reusing
the S18 `schedule_share_links` token (no new schema). The feed mirrors EXACTLY
the client-safe portal view: the ONE **firm install day** + each upcoming
mid-phase **week RANGE** as all-day VEVENTs — the buffer, the raw internal
targets, and the fever data never reach it (`buildClientCalendar` only consumes
the already-safe `ClientScheduleView`). Completed and to-be-scheduled phases emit
no event.

- **Auto-updates in place**: each event has a STABLE per-token UID
  (`<token>-<phase>@schedule.goodwoods.app`); a shifted date re-emits the same UID
  with a new DTSTART, so a subscribed calendar updates the event rather than
  duplicating. `X-PUBLISHED-TTL` / `REFRESH-INTERVAL` hint a 6h re-poll. The
  portal stays the source of truth and the feed lags by design — every
  committed-date change is paired with an immediate email (the S14 re-commit
  flow).
- **Route** is `runtime=nodejs`, `force-dynamic`, flag-gated (404 when
  `NEXT_PUBLIC_SCHEDULING_ENABLED` is off), and a flat 404 on any token miss
  (never leaks existence). Calendar polls pass `stampView: false` to
  `loadScheduleShareLink` so background re-polls don't masquerade as the client
  opening the portal. `Content-Type: text/calendar`, short cache.
- **Add-to-calendar buttons** on the portal (`AddToCalendar`, a client island for
  `window.location`): Subscribe (`webcal://…/feed.ics`, the auto-updating star
  option), Add to Google Calendar, and Download `.ics`. Testids:
  `client-add-to-calendar`, `client-calendar-subscribe`, `client-calendar-google`,
  `client-calendar-download`.

## What's here (S22 notifications + approval line + contacts link, issue #110)

```
features/scheduling/
├── lib/
│   ├── notifications.ts       pure: NotificationKind / requiresApproval /
│   │                          withinDailyBudget / isQuietHours / shouldDebounce /
│   │                          buildLogisticsReminder / buildScheduleNotification /
│   │                          computeHoldReason (+ notifications.test.ts — 26 unit tests)
│   └── notificationsRowMap.ts row ↔ NotificationRecord for scheduling_notifications
└── components/
    └── NotificationsPanel.tsx  approval-queue panel in the Schedule tab
features/contacts/components/ContactDetail.tsx  — gains "Committed install" column
                                                   + "Schedule" link per linked project
                                                   (flag-gated, SCHEDULING_ENABLED)
src/app/api/scheduling/notifications/send/route.ts  — owner-only approved-send route
supabase/migrations/
└── 20260707000000_scheduling_notifications.sql  scheduling_notifications table
```

**Approval line:** anything that involves dates or asks the client for something
(recommit, date change, nudge, kickoff) requires an explicit owner click before
it leaves the shop. Only pure logistics reminders ('we arrive tomorrow') are
auto-send eligible. `requiresApproval(kind)` is the single gate.

**Message budget:** `withinDailyBudget` enforces a per-client/day cap of 2
approval-required messages; `isQuietHours` suppresses sends 9pm–7am UTC;
`shouldDebounce` prevents ripple-cascade email floods within a configurable
window. `computeHoldReason` composes these into a single advisory for the UI.

**Trust-preserving delay flow:** the recommit email draft from S14's
`draftRecommitEmail` (recommit.ts) surfaces in `NotificationsPanel` for approval.
The body must be early, honest, concrete — no theatrics. The panel carries the
pre-composed draft through to Resend via `/api/scheduling/notifications/send`
(reuses the Forms P2 pattern: same env vars, same graceful fallback to
`unconfigured` when `RESEND_API_KEY` is absent).

**Contacts link:** `ContactDetail` gains a "Committed install" column and a
"Schedule" link per linked project when `SCHEDULING_ENABLED`. The schedule link
navigates to the job page where the owner can access and copy the client portal
URL from the Schedule tab. Testids: `contact-committed-install-<jobId>`,
`contact-schedule-link-<jobId>`.

**`scheduling_notifications` schema:** `id uuid`, `job_id text` FK → `jobs.id`,
`kind text`, `recipient_contact_id uuid` FK → `contacts.id`, `recipient_email text`,
`subject text`, `body text`, `status text` (pending_approval → approved → sent /
auto_sent / cancelled), `sent_at`, `resend_email_id`, `created_at`, `created_by`.
RLS authenticated_all + anon_none.

## Non-goals (S1–S5, S10)

No per-machine / per-person capacity (phase-level only in v1), no auto-write
of derived durations into new-job creation, no buffer-burn fever chart, no
per-sub reliability loop, no client portal/ICS, no Google push. Those are
later slices in Milestone #7. `health.ts` stays untouched.
