-- Drawings Slice 3: vector markup objects (ink/highlight; shapes+text in Slice 4).
-- One row per object; geometry normalized 0–1 (data jsonb). RLS authenticated.
CREATE TABLE IF NOT EXISTS public.document_annotations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  text NOT NULL,
  project_id   text NOT NULL,
  page         int  NOT NULL DEFAULT 1,
  type         text NOT NULL CHECK (type IN ('ink','highlight','shape','text')),
  data         jsonb NOT NULL,
  color        text NOT NULL,
  stroke_width numeric,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_annotations_doc_idx
  ON public.document_annotations (document_id, page);
ALTER TABLE public.document_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_annotations_authenticated_all ON public.document_annotations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
