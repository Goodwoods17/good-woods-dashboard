# 16. Active job drawings in Supabase Storage; archive to Google Drive on completion

Date: 2026-06-23
Status: Accepted

## Context

Until now, per-job documents were **Google Drive links only**. The original
`documents` migration (`20260526_documents_and_intake_fields.sql`) states the
posture explicitly: _"Drive-first; no in-Supabase file storage yet."_ Reface
later added a private Supabase Storage bucket (`reface-photos`), but `documents`
stayed Drive-only.

The new **Job Drawings & Markup** feature
(`docs/superpowers/specs/2026-06-23-job-drawings-markup-design.md`) requires the
app to **render the file itself** (pdf.js / `<img>`) so staff can mark it up and
drop status pins. A Google Drive `<iframe>` embed exposes only a preview — you
cannot draw on it. Markup therefore requires the app to **own the file bytes**.

Two further constraints from Andrew:

- **Speed on the job site is non-negotiable** — "no waiting around."
- **Storage cost / capacity** was a worry (resolved below).

Facts that informed the decision:

- The Goodwoods org is on the **Supabase Pro** plan: **100 GB storage included**
  (then ~$0.021/GB), all served via a **cached CDN**. A job's drawings are
  ~100–300 MB, so ~300–500 jobs fit in the included quota before any overage.
  Storage is not a near-term constraint.
- A CDN-served Supabase object loads **faster** than a Drive embed (which pulls
  Google's full viewer in an iframe). Owning the bytes is also the *snappier*
  option on site.

## Decision

**Active-job drawings live in Supabase Storage; finished-job drawings are
archived to Google Drive. External links remain a view-only option throughout.**

1. **Active job → Supabase Storage.** Uploaded PDFs and images go into a private
   `job-documents` bucket (mirroring `reface-photos`: private bucket, signed
   URLs, `bucket_id`-gated policies). `documents` gains `source`
   (`upload`|`link`|`sketch`), `storage_path`, `mime`, `page_count`, and
   `drive_url` becomes nullable. These files are renderable and markable.

2. **Links stay view-only.** A `documents` row with `source = 'link'` (Drive or
   any URL) renders through the existing embed path. It cannot be marked up —
   that is acceptable for reference-only material (appliance packages, permits).

3. **Archive on completion → Google Drive (deferred slice).** When a job is
   completed/archived, its uploaded files move to a Drive folder, the matching
   `documents` rows flip to `source = 'link'` (Drive), and the Supabase objects
   are freed. Markup/pin data stays in Postgres (tiny); optionally the markup is
   **flattened into the archived PDF** so the Drive copy is the final
   marked-up record. This keeps the active bucket small and puts the permanent
   record in Andrew's existing Drive ecosystem. **Not built in Slice 0** —
   storage capacity makes it non-urgent; it is its own later slice.

## Consequences

- Reverses the "Drive-first, no Supabase file storage" stance for documents.
  This ADR is the record of *why*.
- Markup/pins are only available while a job's files are **active** (in
  Supabase). Archived jobs become view-only (their marked-up state preserved by
  the optional flatten step). This matches the workflow: you mark up while
  building/installing, not after the job is closed.
- Storage cost scales with the count of **active** jobs, not all-time jobs —
  archiving caps it. Even without archiving, Pro's 100 GB covers years.
- Uploads require Supabase to be configured (no data-URL/offline fallback for
  files — unlike Reface photos — because PDFs/large images would exceed
  localStorage quota). Offline dev disables upload; links still work.
- The app already supports both `upload` and `link` documents, so the archive
  step is a data transition (move bytes, flip `source`), not a new render path.
