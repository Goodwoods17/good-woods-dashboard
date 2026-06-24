-- Drawings Slice 1: trackable pieces (cabinets + finish parts) with per-kind
-- status lifecycles, optionally pinned to a drawing. See the drawings spec +
-- docs/domain.md (Piece / Stage / Status / Cut method). Status values are
-- validated in code (pipelines.ts), not by a DB check, so kinds/stages can
-- evolve without a migration. RLS = authenticated (single-tenant pattern).

CREATE TABLE IF NOT EXISTS public.job_pieces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        text NOT NULL,
  kind              text NOT NULL,
  subtype           text,
  code              text,
  room              text,
  label             text NOT NULL,
  cut_method        text CHECK (cut_method IN ('inhouse','cnc_sub')),
  status            text NOT NULL DEFAULT 'not_started',
  status_updated_at timestamptz,
  status_updated_by text,
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mozaik')),
  source_ref        text,
  pin_document_id   text,
  pin_page          int,
  pin_x             numeric,
  pin_y             numeric,
  sort_order        int NOT NULL DEFAULT 0,
  dimensions        text,
  material          text,
  edgeband          text,
  parent_ref        text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_pieces_project_idx ON public.job_pieces (project_id);

ALTER TABLE public.job_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_pieces_authenticated_all ON public.job_pieces
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime is consumed in Slice 2; enabling the publication now is harmless.
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_pieces;
