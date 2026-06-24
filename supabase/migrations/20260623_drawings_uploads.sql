-- Drawings Slice 0: let `documents` hold uploaded files (Supabase Storage)
-- alongside Drive/URL links. Active drawings live in Supabase; links stay
-- view-only. See ADR 0016 + spec 2026-06-23-job-drawings-markup-design.md.

ALTER TABLE public.documents
  ALTER COLUMN drive_url DROP NOT NULL,
  ADD COLUMN source       text NOT NULL DEFAULT 'link'
                          CHECK (source IN ('upload','link','sketch')),
  ADD COLUMN storage_path text,
  ADD COLUMN mime         text,
  ADD COLUMN page_count   int;

COMMENT ON COLUMN public.documents.source IS
  'upload (Supabase Storage file) | link (external/Drive URL) | sketch (in-app canvas)';
COMMENT ON COLUMN public.documents.storage_path IS
  'Path within the private job-documents Storage bucket (when source=upload).';
COMMENT ON COLUMN public.documents.mime IS
  'MIME of the uploaded file (application/pdf, image/jpeg, image/png, image/webp).';
COMMENT ON COLUMN public.documents.page_count IS
  'PDF page count (1 for images); null until known.';

-- Private bucket for uploaded job drawings (mirrors reface-photos posture).
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-documents', 'job-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies gated to authenticated users (RLS is the security boundary; a
-- private bucket must never be readable by anon). Mirrors reface-photos.
CREATE POLICY job_documents_bucket_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'job-documents') WITH CHECK (bucket_id = 'job-documents');
CREATE POLICY job_documents_bucket_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'job-documents');
