-- Harden reface-photos storage policies: gate to authenticated (was TO public).
-- A private bucket must never be reachable by the anon role. Brings reface in
-- line with the job-documents bucket posture added the same day. The app
-- requires login everywhere, so authenticated access is unchanged; this only
-- removes the latent anon path. See CLAUDE.md (RLS is the security boundary).

DROP POLICY IF EXISTS reface_photos_bucket_read   ON storage.objects;
DROP POLICY IF EXISTS reface_photos_bucket_insert ON storage.objects;
DROP POLICY IF EXISTS reface_photos_bucket_update ON storage.objects;
DROP POLICY IF EXISTS reface_photos_bucket_delete ON storage.objects;

CREATE POLICY reface_photos_bucket_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'reface-photos') WITH CHECK (bucket_id = 'reface-photos');
CREATE POLICY reface_photos_bucket_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'reface-photos');
