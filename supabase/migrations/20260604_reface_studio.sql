-- Reface Studio: cabinet refacing measurement tool.
--
-- A measurement project holds many photos; each photo holds many pinned elements
-- (doors / drawer fronts / end panels / toe kicks). Elements get their own table
-- (not embedded jsonb) because the door-sizer roadmap will query/update individual
-- elements (order reconciliation, per-element status). order_settings (product spec
-- + price-book selectors + manual shipping cost) lives as jsonb on the project.
--
-- Photos are stored in the private `reface-photos` Storage bucket; reface_photos
-- holds the storage path + natural pixel dims (for normalized pin-box math).
--
-- RLS mirrors the rest of the app: enabled + permissive (USING true). Tighten when
-- multi-role auth lands. Apply with mcp__supabase__apply_migration.

-- ---------------------------------------------------------------------------
-- 1. reface_projects
-- ---------------------------------------------------------------------------

CREATE TABLE public.reface_projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  job_id         text REFERENCES public.jobs(id) ON DELETE SET NULL,
  order_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.reface_projects               IS 'Cabinet refacing measurement projects. Optionally linked to a Job.';
COMMENT ON COLUMN public.reface_projects.job_id        IS 'Optional link to public.jobs(id); fills the order-form customer info.';
COMMENT ON COLUMN public.reface_projects.order_settings IS 'Product spec + New Surrey price-book selectors + manual shipping cost (jsonb).';

CREATE INDEX idx_reface_projects_job ON public.reface_projects(job_id) WHERE job_id IS NOT NULL;

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION public.tg_reface_projects_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_reface_projects_touch
  BEFORE UPDATE ON public.reface_projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_reface_projects_touch_updated();

ALTER TABLE public.reface_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY reface_projects_all ON public.reface_projects FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. reface_photos
-- ---------------------------------------------------------------------------

CREATE TABLE public.reface_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.reface_projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  width        integer NOT NULL DEFAULT 0,
  height       integer NOT NULL DEFAULT 0,
  sort         integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.reface_photos              IS 'Kitchen photos for a refacing project; one per wall/run.';
COMMENT ON COLUMN public.reface_photos.storage_path IS 'Path within the private reface-photos Storage bucket.';
COMMENT ON COLUMN public.reface_photos.width        IS 'Natural pixel width, for normalized pin-box math.';

CREATE INDEX idx_reface_photos_project ON public.reface_photos(project_id);

ALTER TABLE public.reface_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY reface_photos_all ON public.reface_photos FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. reface_elements
-- ---------------------------------------------------------------------------

CREATE TABLE public.reface_elements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id        uuid NOT NULL REFERENCES public.reface_photos(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('door', 'drawer', 'end_panel', 'toe_kick')),
  label           text NOT NULL DEFAULT '',
  location        text NOT NULL DEFAULT '',
  width_in        numeric,
  height_in       numeric,
  qty             integer NOT NULL DEFAULT 1,
  box             jsonb,
  ai_guess        boolean NOT NULL DEFAULT true,
  mullion_sections integer NOT NULL DEFAULT 0,
  dividers        integer NOT NULL DEFAULT 0,
  notes           text NOT NULL DEFAULT '',
  -- forward seams for the door-sizer roadmap (unused in Phase 1)
  style           text,
  material        text,
  hinges          jsonb,
  hinge_positions jsonb,
  sort            integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.reface_elements          IS 'One door/drawer/end-panel/toe-kick pinned on a photo.';
COMMENT ON COLUMN public.reface_elements.label    IS 'Auto ref code shown on the pin: D1, DR1, EP1, TK1.';
COMMENT ON COLUMN public.reface_elements.box      IS 'Normalized {x,y,w,h} 0..1 of the photo, for pin placement.';
COMMENT ON COLUMN public.reface_elements.ai_guess IS 'True until Andrew confirms; drives the unconfirmed badge.';

CREATE INDEX idx_reface_elements_photo ON public.reface_elements(photo_id);

ALTER TABLE public.reface_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY reface_elements_all ON public.reface_elements FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Storage bucket + policies (private bucket; permissive to match app posture)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('reface-photos', 'reface-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY reface_photos_bucket_read ON storage.objects
  FOR SELECT USING (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'reface-photos') WITH CHECK (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'reface-photos');
