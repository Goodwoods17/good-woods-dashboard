-- Project Files & Sharing (Tier-2) · S11 — no-login designer UPLOAD portal
-- (writing token route). ADR 0022 · milestone #12.
--
-- The /d/<token> document_request portal lets a no-login token holder drop
-- requested files straight into a job. The route is the authoritative gate
-- (re-checks revoked_at before the write, sniffs magic bytes, enforces a per-file
-- size limit + per-token count/byte quota, server-generates the object path with
-- upsert:false). THIS migration adds bucket-level defence-in-depth on the shared
-- private `job-documents` bucket so a bug or a bypass of the route still can't
-- land an oversized or wrong-type object:
--   * file_size_limit    — 25 MiB hard ceiling on any single object,
--   * allowed_mime_types — only the real types the app stores here.
--
-- The bucket is already used by staff drawings + S10 install photos; both upload
-- ONLY PDFs / PNG / JPEG / WEBP, so this allow-list is a strict superset of the
-- live writers (the legacy seed's toolpath .nc row has NO stored object, so it is
-- unaffected). ADDITIVE + idempotent — it only tightens an existing bucket; no
-- new table, no RLS change. Ships behind NEXT_PUBLIC_PROJECT_FILES_ENABLED at the
-- app layer (the bucket limits are harmless to the dormant prod path).

update storage.buckets
set
  file_size_limit = 26214400, -- 25 MiB
  allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
where id = 'job-documents';

-- Reload PostgREST schema cache (storage admin reads see the change immediately).
notify pgrst, 'reload schema';
