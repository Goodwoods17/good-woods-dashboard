# 0011. Sessions measure active time; pause is a within-sitting break

Date: 2026-06-22

## Status

**Accepted.** Defines the semantics of the reworked real-time labour timer
(plan: `~/.claude/plans/lets-plan-the-timer-eager-tulip.md`; design context:
`docs/superpowers/specs/2026-06-22-shopfloor-timers-timecards-design.md`). Builds
on ADR 0010 (QuickBooks-ready model — a Session maps to a QB Time Activity).
Grilled with Andrew 2026-06-22.

## Context

The labour timer was binary Start→Stop with no pause. Adding pause forces a
decision the old model never had to make: **what does a Session's duration
actually measure**, and **what is a pause allowed to represent**? The answer
ripples into the cost code's historical average, the in-house labour Cost-actual,
the QuickBooks Time Activity, and the live pace target an employee races against.
Get it wrong and the shop's "how long does ASM-BASE take" number quietly drifts.

## Decision

1. **A Session measures active time — pauses excluded.** Duration = banked active
   segments + the current live segment; wall-clock start→stop is not used. The
   per-code historical average, the labour Cost-actual, and pace all read active
   time, so a forgotten lunch never inflates them.
2. **Pause is a within-sitting break only** (lunch, interruption, phone call).
   Switching to a different cost code, or ending the day, is a **Stop** + a new
   Session later — never a pause. A Session therefore stays one bounded block of
   one cost code by one worker, and never straddles two days.
3. **One open Session per worker (auto-stop).** Starting a Session for a worker
   who already has one open auto-stops the previous (banking its active time). A
   person can't be in two places; two concurrent Sessions would double-count their
   day and corrupt averages. A shared task = two Sessions, one per worker.

Mechanically: three additive columns on `labour_sessions` — `accumulated_ms`
(banked active time), `resumed_at` (start of the live segment; null = paused/
stopped), `target_quantity` — with state derived as running (`ended_at` null,
`resumed_at` set) / paused (`ended_at` null, `resumed_at` null) / stopped
(`ended_at` set). Migration `20260622120000_labour_session_pause.sql`.

## Alternatives considered

- **Wall-clock duration (including pauses).** Simpler, but makes the historical
  average and labour cost depend on how distracted the day was — useless as an
  estimating signal and wrong as a labour cost. Rejected.
- **A `labour_session_segments` child table** (one row per active span). Cleaner
  audit of every pause, but breaks the store's single-row optimistic
  fire-and-forget idiom (every pause becomes a child insert + a join on load).
  The feature needs active *duration*, not a pause audit. Rejected for v1.
- **Free concurrency (no auto-stop).** Trusts the floor, but lets one worker
  accumulate overlapping Sessions that double-count their hours on the daily time
  card. Rejected.

## Consequences

- Historical averages and labour Cost-actuals are honest hands-on minutes; the
  daily time card (a later phase) can trust per-worker totals.
- `durationMs` carries a backward-compat path: pre-pause completed rows
  (`accumulated_ms` 0, never resumed) keep their old wall-clock duration, so the
  averages already collected survive the migration.
- Pause time is currently discarded (not logged). If "where did the day go"
  (idle/break accounting) is ever wanted for payroll, that's a separate addition,
  not a change to this model.
- A driven code auto-stopped by a worker starting another task saves with
  `quantity` unset; the Recent list offers a "set units" correction.
