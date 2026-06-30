-- Project Files & Sharing (Tier-2) · S12 — parallel approval routing for shop
-- drawings (milestone #12, issue #226). ADR 0022 family.
--
-- A shop drawing is routed to several reviewers AT ONCE (architect + GC + PM by
-- default). Each reviewer leaves one status on their own slot; the document only
-- moves to Approved once EVERY required reviewer approves. This table is the per
-- (document, reviewer_role) slot — the "resource ref + reviewer_role + status +
-- reviewed_at" of the DoD. The all-approved computation + the 3-status colour
-- system live in TS (features/documents/lib/approvalRouting.ts); the DB stores
-- the slots and enforces one slot per role.
--
-- ADDITIVE: a brand-new table; nothing existing is touched. Ships behind
-- NEXT_PUBLIC_PROJECT_FILES_ENABLED (OFF in prod) — no UI reads it until the
-- owner flips the flag after review + applying this migration.
--
-- documents.id is uuid (see 20260526_documents_and_intake_fields.sql); the FK
-- column matches. ON DELETE CASCADE so deleting a drawing clears its routing.

create table if not exists public.document_approvals (
  id              uuid primary key default gen_random_uuid(),

  -- The resource being approved — a project document (shop drawing). CASCADE so
  -- a removed drawing takes its routing slots with it.
  document_id     uuid not null references public.documents(id) on delete cascade,

  -- Which reviewer this slot is for: 'architect' | 'gc' | 'pm'. Validated in TS
  -- (ReviewerRole); stored as text so a new role needs no migration.
  reviewer_role   text not null,

  -- The reviewer's verdict: 'pending' | 'approved' | 'needs_revision'.
  status          text not null default 'pending',

  -- Optional human name + note captured when the reviewer leaves a verdict.
  reviewer_name   text,
  notes           text,

  -- Set when the reviewer moves off 'pending'; null while still awaited.
  reviewed_at     timestamptz,

  created_at      timestamptz not null default now(),
  created_by      text,

  -- Exactly one slot per (document, reviewer_role) — re-routing updates in place.
  constraint document_approvals_doc_role_uniq unique (document_id, reviewer_role),

  constraint document_approvals_status_valid check (
    status in ('pending', 'approved', 'needs_revision')
  )
);

comment on table public.document_approvals is
  'S12 (ADR 0022 family): parallel approval routing slots for shop drawings. One '
  'row per (document_id, reviewer_role); the doc moves to Approved only once every '
  'required reviewer approves (computed in approvalRouting.ts). Ships behind '
  'NEXT_PUBLIC_PROJECT_FILES_ENABLED (off in prod).';

-- List a document's routing slots.
create index if not exists document_approvals_document_idx
  on public.document_approvals (document_id);

-- ─── RLS: canonical *_authenticated_all + *_anon_none ───────────────────────
-- Reviews are owner-side (the logged-in shop manages routing under RLS). Anon —
-- including any future no-login portal — is denied entirely here.
alter table public.document_approvals enable row level security;

drop policy if exists document_approvals_authenticated_all on public.document_approvals;
create policy document_approvals_authenticated_all on public.document_approvals
  for all to authenticated using (true) with check (true);

drop policy if exists document_approvals_anon_none on public.document_approvals;
create policy document_approvals_anon_none on public.document_approvals
  for all to anon using (false) with check (false);

-- Reload PostgREST schema cache so the new table is queryable now.
notify pgrst, 'reload schema';
