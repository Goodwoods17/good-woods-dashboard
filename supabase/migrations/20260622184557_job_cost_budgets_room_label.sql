-- Per-room budget breakdown (ADR 0012 Slice 2 follow-on). A Mozaik import carries
-- per-room cabinet/finishing/cut quantities, so the frozen labour budget can be
-- split by room. Additive + nullable: existing job-level budget rows (room_label
-- null) are unaffected; budget-vs-actual can later compare per room.

alter table public.job_cost_budgets
  add column if not exists room_label text;

comment on column public.job_cost_budgets.room_label is
  'Optional room this budget line belongs to (from a Mozaik per-room import). Null = a job-level line.';

notify pgrst, 'reload schema';
