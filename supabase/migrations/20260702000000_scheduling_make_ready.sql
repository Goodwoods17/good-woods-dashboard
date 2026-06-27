-- Scheduling & Client-Commitment Engine — S12: make-ready gate (issue #100).
--
-- Last-Planner "make-ready" principle: before committing to start a phase, the
-- shop lead verifies all prerequisites are in place. This table stores the
-- per-job phase readiness checklist state.
--
-- Standard items are defined in code (makeReady.ts → STANDARD_MAKE_READY_ITEMS)
-- and materialised per-job on first access. This table holds:
--   - Which standard item is tracked (identified by template_item_id)
--   - Manual check state (auto-signal items are derived at read time, not stored)
--   - Soft-gate override (ADR 0013: owner acknowledged not-ready, proceeds anyway)
--
-- Ships behind NEXT_PUBLIC_SCHEDULING_ENABLED (off in prod). All changes are
-- additive. RLS: authenticated-only (matches the rest of the scheduling tables).

CREATE TABLE IF NOT EXISTS public.scheduling_make_ready_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The job this checklist item belongs to.
  job_id text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- One of the six MilestoneStage phases.
  phase text NOT NULL
    CHECK (phase IN ('design', 'cnc', 'assembly', 'finishing', 'delivery', 'install')),

  -- Stable template item id from STANDARD_MAKE_READY_ITEMS (e.g. "cnc-mr-01").
  -- Used to merge stored state back onto the standard items at read time.
  template_item_id text NOT NULL,

  -- Human-readable label (snapshot from the template at materialisation time,
  -- so per-job edits or future template label changes don't silently rewrite history).
  label text NOT NULL,

  -- 'template' = seeded from STANDARD_MAKE_READY_ITEMS; 'custom' = added per-job.
  source text NOT NULL DEFAULT 'template'
    CHECK (source IN ('template', 'custom')),

  -- Named auto-signal (null = manually checked). Stored here so the component
  -- can identify which items are auto-ticked without re-computing from code.
  auto_signal text
    CHECK (auto_signal IN ('blocker_resolved', 'design_signoff', 'material_logged')),

  -- Manual check state. Auto-signal items: this is overridden at render time by
  -- applyAutoSignals(); manual items: this is the authoritative state.
  checked boolean NOT NULL DEFAULT false,

  -- Soft-gate override (ADR 0013): owner acknowledged "not ready" and chose to
  -- proceed. An overridden item passes the phase gate without being checked.
  overridden boolean NOT NULL DEFAULT false,

  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per (job, template item). Custom items don't collide (template_item_id
  -- will be a generated uuid for those).
  UNIQUE (job_id, template_item_id)
);

COMMENT ON TABLE public.scheduling_make_ready_items IS
  'Per-job phase readiness checklist for the make-ready gate (S12). Standard items are defined in makeReady.ts and materialised on first access; this table holds manual check + soft-gate override state.';

COMMENT ON COLUMN public.scheduling_make_ready_items.template_item_id IS
  'Stable id from STANDARD_MAKE_READY_ITEMS (e.g. "cnc-mr-01"). Used to merge stored state onto standard items at read time.';

COMMENT ON COLUMN public.scheduling_make_ready_items.overridden IS
  'Soft-gate override (ADR 0013): owner acknowledged the item is not yet ready but chose to proceed anyway. Counts as "passed" for gate purposes.';

-- updated_at trigger (set_updated_at already exists from earlier migrations).
DROP TRIGGER IF EXISTS scheduling_make_ready_items_updated_at ON public.scheduling_make_ready_items;
CREATE TRIGGER scheduling_make_ready_items_updated_at
  BEFORE UPDATE ON public.scheduling_make_ready_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes for the two most-common access patterns.
CREATE INDEX IF NOT EXISTS scheduling_make_ready_items_job_phase_idx
  ON public.scheduling_make_ready_items (job_id, phase);

CREATE INDEX IF NOT EXISTS scheduling_make_ready_items_job_idx
  ON public.scheduling_make_ready_items (job_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.scheduling_make_ready_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduling_make_ready_items_auth_all" ON public.scheduling_make_ready_items;
CREATE POLICY "scheduling_make_ready_items_auth_all"
  ON public.scheduling_make_ready_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scheduling_make_ready_items_anon_none" ON public.scheduling_make_ready_items;
CREATE POLICY "scheduling_make_ready_items_anon_none"
  ON public.scheduling_make_ready_items FOR ALL TO anon
  USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
