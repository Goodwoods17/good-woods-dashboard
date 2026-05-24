-- Adds free-text blocker + next_step columns to public.jobs so the
-- Hitlist + Schedule views can render real values instead of the
-- synthetic heuristic from features/jobs/lib/blockers.ts.
--
-- Both columns are nullable; jobs without a value continue to render
-- via the synthetic path with a "demo" tag.
--
-- Apply with: paste this into Supabase SQL Editor and run.
-- Then notify PostgREST to refresh its schema cache.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS next_step text;

COMMENT ON COLUMN public.jobs.blocker IS
  'Free-text current blocker. NULL = use synthetic heuristic with demo tag.';
COMMENT ON COLUMN public.jobs.next_step IS
  'Free-text next concrete action. NULL = use synthetic heuristic with demo tag.';

NOTIFY pgrst, 'reload schema';
