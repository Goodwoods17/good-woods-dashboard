-- Real-time pace timer (ADR 0011): labour Sessions gain pause/resume + a driven
-- target. A Session now measures ACTIVE time (pauses excluded); start/pause/
-- resume/stop are derived from ended_at + resumed_at, and accumulated_ms banks
-- active time from completed segments. ALL ADDITIVE.

alter table public.labour_sessions
  add column if not exists accumulated_ms numeric not null default 0,
  add column if not exists resumed_at timestamptz,
  add column if not exists target_quantity numeric;

comment on column public.labour_sessions.accumulated_ms is
  'Active time (ms) banked from completed segments before the current live one; pauses do not inflate it. On Stop this holds the full active total.';
comment on column public.labour_sessions.resumed_at is
  'Start of the current live active segment. Running = ended_at null & resumed_at set; paused = ended_at null & resumed_at null; stopped = ended_at set.';
comment on column public.labour_sessions.target_quantity is
  'Y for a driven cost code: target units entered on Start (drives the suggested time). Actual units done are still captured as quantity on Stop.';

-- Keep any currently-running session ticking under the new model (legacy rows
-- predate resumed_at; without this they would read as paused/frozen at 0).
update public.labour_sessions
  set resumed_at = started_at
  where ended_at is null and resumed_at is null;

notify pgrst, 'reload schema';
