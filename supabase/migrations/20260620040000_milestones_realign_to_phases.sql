-- ADR 0008: job milestones realign to the six phases.
--
-- ⚠️ NOT YET APPLIED to the shared Supabase project. Apply ONLY together with
--    deploying the new MilestoneStage enum (commit 792d328) — the new values
--    (design/cnc/assembly/finishing/delivery/install) break any running build
--    that still uses the old enum (sold/materials/cut/assemble/finish/install).
--    Coordinate the apply + deploy, or run it against a Supabase dev branch first.
--
-- jobs.current_milestone is plain `text` (0001_jobs.sql) — no CHECK/enum to alter.

update jobs
set current_milestone = case current_milestone
  when 'sold'      then 'design'
  when 'materials' then 'cnc'
  when 'cut'       then 'cnc'
  when 'assemble'  then 'assembly'
  when 'finish'    then 'finishing'
  else current_milestone   -- 'install' unchanged; 'delivery' is new (no legacy rows map to it)
end;

-- Guard: fail loudly if any row is left with a value outside the six phases,
-- rather than silently leaving stale data the new UI can't render.
do $$
declare bad int;
begin
  select count(*) into bad from jobs
  where current_milestone not in ('design','cnc','assembly','finishing','delivery','install');
  if bad > 0 then
    raise exception 'milestone backfill left % row(s) with an unmapped current_milestone', bad;
  end if;
end $$;
