-- Documents table: per-project PDF/spec references via Drive URLs.
-- Drive-first matches Andrew's existing Google ecosystem; no Supabase
-- Storage bucket required. Storage upload comes later if the workflow
-- demands it.
--
-- Also adds two intake-form fields on jobs:
--   - source: how the client found us (anchor designer, Google, referral)
--   - estimated_revenue: original quote (compared against final revenue)

CREATE TABLE public.documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN (
    'designer', 'toolpath_cnc', 'shop', 'architect',
    'appliance', 'permit', 'photo', 'other'
  )),
  label       text NOT NULL,
  drive_url   text NOT NULL,
  version     text,
  is_current  boolean NOT NULL DEFAULT true,
  notes       text,
  uploaded_by text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_project ON public.documents(project_id);
CREATE INDEX idx_documents_kind    ON public.documents(kind);
CREATE INDEX idx_documents_current ON public.documents(is_current) WHERE is_current = true;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_all ON public.documents FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.documents IS 'Per-project document references (PDFs in Google Drive). Drive-first; no in-Supabase file storage yet.';
COMMENT ON COLUMN public.documents.kind IS 'designer | toolpath_cnc | shop | architect | appliance | permit | photo | other';
COMMENT ON COLUMN public.documents.drive_url IS 'Full Google Drive share URL. Parsed in TS to extract file ID for embed preview.';
COMMENT ON COLUMN public.documents.version IS 'Free-text revision label, e.g. R3, Initial, Post-RFI.';
COMMENT ON COLUMN public.documents.is_current IS 'Marks the current revision per (project_id, kind, label). UI surfaces only is_current=true by default.';

ALTER TABLE public.jobs
  ADD COLUMN source            text,
  ADD COLUMN estimated_revenue numeric;

COMMENT ON COLUMN public.jobs.source IS 'How did the client find us? Anchor-designer name, Google, referral, walk-in, repeat. Feeds attribution.';
COMMENT ON COLUMN public.jobs.estimated_revenue IS 'Original quote/estimate. Compare against final revenue for quote-accuracy tracking.';

NOTIFY pgrst, 'reload schema';
